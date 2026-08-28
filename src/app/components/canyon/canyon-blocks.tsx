'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { AURORA_GLSL } from '@/app/components/canyon/aurora-glsl'

/**
 * Everything solid in the canyon: the two walls, the slabs leaning off them,
 * and the broken ground at their feet.
 *
 * All of it is boxes and one displaced plane - there is not a curve in the
 * place, and that is the look rather than a shortcut. The picture this is after
 * is faceted: what makes it read as crystal is that every face is flat and
 * catches the sky at its own angle, which is exactly what a low-poly mesh gives
 * you for free and what a smooth one has to fake.
 *
 * One material across all three, and one draw call for the two walls. The
 * variety - which panel glows orange, which edge burns cyan - is a function of
 * where a fragment *is*, not of an attribute per instance. That is worth the
 * paragraph it costs: a per-instance tint would mean an InstancedBufferAttribute
 * the ridge meshes cannot supply, so the same material would light a wall and a
 * ridge differently for no reason anybody could see.
 */

/** Half the road. The towers stand outside this, and nothing crosses it. */
export const ROAD_HALF = 26

/**
 * Where the broken ground starts, which is well inside the towers.
 *
 * The verge has to encroach on the road to be seen at all: at anything past
 * about twenty metres the shards are behind the near towers from every angle
 * the camera can take, and the picture is a clean road running into a clean
 * wall. Eight metres of overlap is what puts them in shot.
 */
const VERGE_START = 18

/**
 * The corridor starts behind you and ends before the backdrop does.
 *
 * Behind, because the nearest towers have to be cut off by the edges of the
 * frame - a wall you can see the near end of is a building, and this is meant
 * to be a place you are already inside. Before, because the road reflects the
 * backdrop and a fragment standing further away than the thing it is
 * reflecting has nothing to bounce off. See <GridRoad>.
 */
const NEAR_Z = 60
const FAR_Z = -230

/**
 * A seeded generator, because the layout must not change between renders.
 *
 * `Math.random()` here would rebuild the canyon on every hot reload and, worse,
 * make two people looking at the same page look at different places. Mulberry32
 * is thirty-two bits of state and four operations, which is all a pile of
 * rubble needs.
 */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The dark, faceted surface everything solid is made of.
 *
 * Unlit in the three.js sense - there is no lamp in this scene and nothing here
 * reads `normalMatrix` for a diffuse term. A cliff face at the end of a canyon
 * is lit by the sky in front of it and by nothing else, so that is what the
 * shader computes: how much of a face turns toward the corridor, how close to
 * the silhouette a fragment sits, and how high up it is. Adding a directional
 * light would put a second, disagreeing sun in a picture whose whole subject is
 * the one light source at the end of it.
 */
function createFacetMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFogColour: { value: new THREE.Color('#0a0616') },
      uFogDensity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying vec3 vView;
      varying float vDepth;

      void main() {
        // The walls are instanced and the ridges are not; three only declares
        // the attribute for the first, so the identity stands in for the rest.
        mat4 instance = mat4(1.0);
        #ifdef USE_INSTANCING
          instance = instanceMatrix;
        #endif

        vec4 world = modelMatrix * instance * vec4(position, 1.0);
        vec4 view = viewMatrix * world;

        vWorld = world.xyz;
        // Scale is axis-aligned and these are boxes, so the rotation part is
        // enough: a face normal that starts on an axis survives a diagonal
        // scale unchanged in direction, and the ridges are unscaled.
        vNormalW = normalize(mat3(modelMatrix) * mat3(instance) * normal);
        vView = cameraPosition - world.xyz;
        vDepth = -view.z;

        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uFogColour;
      uniform float uFogDensity;

      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying vec3 vView;
      varying float vDepth;

      ${AURORA_GLSL}

      void main() {
        vec3 n = normalize(vNormalW);
        vec3 v = normalize(vView);
        float facing = clamp(dot(n, v), 0.0, 1.0);
        // The band hugging every silhouette. Steep, so it stays a line on the
        // edge rather than a wash over the face.
        float rim = pow(1.0 - facing, 3.2);

        // How much this face turns toward the middle of the road, which is
        // where all the light in this world comes from.
        float inward = clamp(-sign(vWorld.x) * n.x, 0.0, 1.0);
        // And how far up the cliff it is. The feet of these things are in
        // shadow and their tops are in the aurora.
        //
        // Floored well above zero, which the verges depend on: they are ten
        // metres tall beside a wall of sixty, so a term that reaches zero at
        // ground level painted every shard in the scene pure black and the
        // whole feature was invisible for three passes.
        float lift = 0.22 + 0.78 * smoothstep(-4.0, 70.0, vWorld.y);

        // The sky's own colour where this fragment stands, so the left wall
        // catches magenta and the right one catches blue without either being
        // told which side of the road it is on. The same ramp the backdrop is
        // painted with, read at the same place across.
        vec3 spill = auroraTint(clamp(vWorld.x / 90.0 + 0.5, 0.0, 1.0) - uTime * 0.004);

        // A block at a time, light or dark. Without this every face at the same
        // height is the same value and the wall reads as one folded surface
        // rather than as a pile of separate things - which is the whole reason
        // the towers are stacks in the first place.
        float grain = 0.18 + 1.55 * hash31(floor(vWorld / 7.0));

        vec3 colour = mix(vec3(0.012, 0.007, 0.030), vec3(0.048, 0.029, 0.100), lift) * grain;
        colour += spill * inward * (0.016 + 0.060 * lift) * grain;

        // What a face gets simply for being turned toward the sky, which is
        // the only lamp in the scene. This is what a shard on the verge lives
        // on - it has no side facing the middle of the road, so the term above
        // does nothing for it - and it is why the ground reads as broken glass
        // rather than as a silhouette.
        float skyward = 0.30 + 0.70 * max(n.y, 0.0);
        colour += spill * skyward * 0.22 * grain;

        // The scattered lit panels: a face here and there that is glass rather
        // than rock. A cell is a patch of one face - the normal is folded into
        // the key, so a corner does not carry its colour round onto the next
        // side - and roughly one in twenty comes up lit.
        //
        // Faded out with distance, which is not decoration: the cells are about
        // three metres across, so past a hundred or so they are smaller than a
        // pixel and the hash turns into coloured static.
        vec3 pane = floor(vWorld / 3.4) + n * 4.0;
        float seed = hash31(pane);

        // How big a cell is on screen, in cells per pixel. A face seen almost
        // edge-on crosses many of them in one pixel, and a hash sampled faster
        // than the pixels can hold it is coloured static - which is exactly
        // what the first version of this looked like along every wall that
        // turned away. Distance alone does not catch it: the worst offenders
        // are close and steeply angled.
        float perPixel = length(fwidth(vWorld)) / 3.4;
        float legible = 1.0 - smoothstep(0.15, 0.7, perPixel);
        float glazed = smoothstep(0.895, 0.990, seed) * legible;
        vec3 glass = mix(auroraTint(fract(seed * 6.71)), spill, 0.35);
        colour = mix(colour, glass * (0.16 + 0.55 * facing), glazed);

        colour += spill * rim * 0.95;
        colour += vec3(0.26, 0.15, 0.55) * rim * 0.40;

        // Three's fog chunks are for its own materials, and a cliff that
        // ignores the fog stands in front of a corridor that has already faded.
        float fogged = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
        colour = mix(colour, uFogColour, fogged);

        gl_FragColor = vec4(colour, 1.0);
      }
    `,
  })
}

/**
 * One material for the whole canyon, wound forward on the frame loop.
 *
 * The fog is read off the scene rather than hardcoded, because the density
 * belongs to whoever mounted the scene and a surface with its own idea of the
 * fog hangs at a different distance from everything around it.
 *
 * Read on the frame loop rather than in an effect, which is the subtle part.
 * `<fogExp2 attach="fog">` is attached to the scene during the commit that
 * mounts it - so a `useThree(state => state.scene.fog)` selector, which runs
 * during *render*, sees null, and the effect that follows closes over that
 * null. Nothing ever invalidates it either: the store's scene is the same
 * object before and after, so the selector is never re-run and this scene, which
 * never re-renders after mount, would stay unfogged for good. A frame callback
 * always sees the scene as it currently is.
 */
function useFacetMaterial(still: boolean): THREE.ShaderMaterial {
  const material = useMemo(() => createFacetMaterial(), [])

  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    windClock(material, still, state.clock.elapsedTime)
    wearFog(material, state.scene.fog)
  })

  return material
}

/**
 * The clock uniform, written from a frame callback.
 *
 * Out here as a plain function taking the material rather than inline in the
 * hook, and not as a style choice: a uniform is mutable state on a long-lived
 * object, which is the one thing a hook body may not touch - `react-hooks`
 * refuses a memo value modified after render. Passing it as an argument is
 * honest about what this is, which is imperative renderer state being written
 * once a frame. `<Rainbow>` solved the same problem the same way.
 *
 * `still` freezes the whole scene at a fixed instant rather than at zero: the
 * aurora at time zero is the noise field's own origin, which is flatter and
 * less interesting than anywhere else in it.
 */
export function windClock(material: THREE.ShaderMaterial, still: boolean, seconds: number) {
  material.uniforms.uTime.value = still ? FROZEN : seconds
}

/** The instant a scene that has been asked not to move is held at. */
const FROZEN = 8

/**
 * The scene's fog, copied onto a material that gets none of three's fog chunks.
 *
 * Two writes a frame and no allocation, so there is nothing to gain by
 * guarding it - and a guard would have to know when somebody changed the fog,
 * which is the problem this exists to avoid. Linear fog and no fog at all both
 * land in the same branch: the shaders only know the exponential kind, and
 * zero density is the honest answer for anything else.
 */
export function wearFog(
  material: THREE.ShaderMaterial,
  fog: THREE.Fog | THREE.FogExp2 | null,
) {
  if (fog instanceof THREE.FogExp2) {
    material.uniforms.uFogColour.value.copy(fog.color)
    material.uniforms.uFogDensity.value = fog.density
  } else {
    material.uniforms.uFogDensity.value = 0
  }
}

interface Slab {
  position: [number, number, number]
  size: [number, number, number]
  tilt: [number, number, number]
}

/**
 * The two cliffs, as a pile of boxes.
 *
 * A tower is a stack rather than one tall box, and every block in it is a
 * little wider or narrower than the one below with a hand's worth of offset -
 * which is the entire source of the serrated skyline. Three ranks deep on each
 * side, so the gaps between the front towers show more wall behind them instead
 * of showing the sky.
 *
 * The corridor narrows slightly with distance on top of the perspective it
 * already has. Strictly this is cheating - parallel walls converge on their own
 * - but the vanishing point is the subject of the picture and a few degrees of
 * help makes the gap read as somewhere you are heading rather than as a gap.
 */
function buildWalls(): Slab[] {
  const random = seeded(0x5ea1c0de)
  const slabs: Slab[] = []

  for (const side of [-1, 1]) {
    for (let rank = 0; rank < 3; rank++) {
      const towers = 20
      for (let i = 0; i < towers; i++) {
        const along = i / (towers - 1)
        const z = NEAR_Z + (FAR_Z - NEAR_Z) * along + (random() - 0.5) * 7

        // Rank zero is the road's own edge; the ones behind it stand off in
        // steps roughly a tower wide.
        const inner = ROAD_HALF + 1 + rank * 15 - along * 6
        const x = side * (inner + random() * 4)

        const width = 7 + random() * 7
        const deep = 8 + random() * 8
        // Roughly twice the road's half-width, and no taller.
        //
        // This is the proportion the whole picture rests on and it took two
        // tries to find: towers of a hundred and fifty against a road forty
        // across close the wedge of sky between them to a slot, and the aurora
        // - the thing everything else in the scene is lit by - ends up hidden
        // behind the very walls it is supposed to be falling into.
        const top = 28 + random() * 38 + rank * 12

        let y = -4
        while (y < top) {
          const height = 3 + random() * 6
          const spread = 0.78 + random() * 0.42
          slabs.push({
            position: [
              x + (random() - 0.5) * 2.6,
              y + height / 2,
              z + (random() - 0.5) * 2.6,
            ],
            size: [width * spread, height, deep * spread],
            tilt: [0, (random() - 0.5) * 0.12, 0],
          })
          y += height
        }
      }
    }
  }

  return slabs
}

/**
 * The slabs that have come away from the walls.
 *
 * Big, tilted, and close - the two or three per side that hang into the top
 * corners of the frame and give the corridor a ceiling it does not have. They
 * are the only things in the scene with a rotation worth speaking of, which is
 * what makes them read as debris rather than as more architecture.
 */
function buildDebris(): Slab[] {
  const random = seeded(0xc0ffee11)
  const slabs: Slab[] = []

  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const size = 15 + random() * 18
      slabs.push({
        position: [
          side * (ROAD_HALF + 4 + random() * 20),
          18 + random() * 58,
          34 - i * 30 - random() * 16,
        ],
        size: [size, size * (0.6 + random() * 0.7), size * (0.6 + random() * 0.7)],
        tilt: [
          (random() - 0.5) * 1.1,
          (random() - 0.5) * 1.1,
          (random() - 0.5) * 0.9,
        ],
      })
    }
  }

  return slabs
}

/**
 * The walls and the debris, in one instanced draw.
 *
 * Composed once into matrices and never touched again: nothing here moves, and
 * the only thing that changes frame to frame is a uniform on the material they
 * share.
 */
function Walls({ material }: { material: THREE.ShaderMaterial }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const slabs = useMemo(() => [...buildWalls(), ...buildDebris()], [])

  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const matrix = new THREE.Matrix4()
    const place = new THREE.Vector3()
    const turn = new THREE.Quaternion()
    const euler = new THREE.Euler()
    const scale = new THREE.Vector3()

    slabs.forEach((slab, index) => {
      place.set(...slab.position)
      euler.set(...slab.tilt)
      turn.setFromEuler(euler)
      scale.set(...slab.size)
      matrix.compose(place, turn, scale)
      mesh.setMatrixAt(index, matrix)
    })

    mesh.count = slabs.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [slabs])

  return <instancedMesh ref={meshRef} args={[geometry, material, slabs.length]} />
}

/**
 * The broken ground between the road and the walls.
 *
 * A plane, displaced and then flattened: `toNonIndexed` before the normals are
 * computed is the whole of the low-poly look, because a shared vertex averages
 * its faces' normals and smooths away the very facets this is for.
 *
 * Ridged rather than rolling. The absolute of the noise, inverted, puts a crease
 * along every zero crossing, which is what turns hills into shards - and the
 * squaring afterwards keeps the troughs flat so the road still has a verge.
 */
function buildRidge(side: number): THREE.BufferGeometry {
  const width = 54
  const length = NEAR_Z - FAR_Z
  const across = 26
  const along = 90

  const geometry = new THREE.PlaneGeometry(width, length, across, along)
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(side * (VERGE_START + width / 2), 0, (NEAR_Z + FAR_Z) / 2)

  const position = geometry.attributes.position as THREE.BufferAttribute
  const random = seeded(side > 0 ? 0x1c3b7a : 0x7a3b1c)

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const z = position.getZ(i)

    // How far out from the road's edge, where 1 is "fully grown".
    //
    // Over a *quarter* of the strip's width rather than all of it, which is the
    // difference between shards you can see and a verge that is flat wherever
    // the camera can look: the far side of this strip is behind the towers, so
    // spreading the climb across the whole thing puts every shard out of shot.
    //
    // Clamped at zero because the strip starts a little inside the road's edge,
    // and without that the line below asks for a fractional power of a negative
    // number and the whole geometry comes out NaN.
    const out = Math.min(Math.max(Math.abs(x) - VERGE_START, 0) / 16, 1)

    let height = 0
    let frequency = 0.055
    let amplitude = 1
    for (let octave = 0; octave < 4; octave++) {
      const wave =
        Math.sin(x * frequency * 1.7 + z * frequency * 0.9) *
        Math.cos(z * frequency * 1.3 - x * frequency * 0.6)
      height += (1 - Math.abs(wave)) * amplitude
      frequency *= 2.1
      amplitude *= 0.55
    }

    // Sharpened, scaled by how far out it is, and roughened by a little
    // per-vertex noise so no two shards are the same shard.
    //
    // The exponent sharpens the crease and the multiplier is what makes these
    // *shards* rather than a rumpled sheet: at 2.4 and 24 the typical spike
    // came out four metres tall next to a sixty-metre wall, which is a texture
    // nobody can see from a road.
    const shard = Math.pow(height / 2.2, 1.5) * 34 * Math.pow(out, 0.55)
    position.setY(i, shard * (0.6 + random() * 0.8) - 1.6)
  }

  const faceted = geometry.toNonIndexed()
  faceted.computeVertexNormals()
  geometry.dispose()
  return faceted
}

/** The two verges, one mesh each, sharing the walls' material. */
function Ridges({ material }: { material: THREE.ShaderMaterial }) {
  const left = useMemo(() => buildRidge(-1), [])
  const right = useMemo(() => buildRidge(1), [])

  useEffect(
    () => () => {
      left.dispose()
      right.dispose()
    },
    [left, right],
  )

  return (
    <>
      <mesh geometry={left} material={material} />
      <mesh geometry={right} material={material} />
    </>
  )
}

/**
 * The canyon: both cliffs, the debris and both verges.
 *
 * One component because they are one material, and the material is the thing
 * with state in it - a clock uniform and the scene's fog. Mounting the walls
 * and the ridges separately would mean two of it, wound forward twice a frame,
 * and the day one of them was given a different fog they would stop being the
 * same rock.
 */
export function Canyon({ still }: { still: boolean }) {
  const material = useFacetMaterial(still)

  return (
    <>
      <Walls material={material} />
      <Ridges material={material} />
    </>
  )
}
