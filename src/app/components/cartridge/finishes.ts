import * as THREE from 'three'
import { type Finish as CartridgeFinish } from '@kxb/xp'
import { plasticGrain, rustMottle } from '@/app/components/cartridge/grain'

/**
 * What a cartridge is made of.
 *
 * ---------------------------------------------------------------------------
 * Why a level gets to choose
 * ---------------------------------------------------------------------------
 * The shell is the only part of a cartridge that is not already the level's own
 * work. The cover is its picture, the name is its name, and the plastic behind
 * both was a hue derived from its id - which is a colour nobody chose, on the
 * one object in the product that is *about* being collected. A finish is the
 * smallest thing an author can say about how their level should sit on a shelf
 * next to somebody else's.
 *
 * Seven, and no more, for the reason a colour picker was not the answer: a
 * shelf of levels each with an arbitrary shell is a jumble, and a shelf of
 * seven materials is a set. The hue is still derived - a rusted cartridge and a
 * shiny one are both tinted by their id - so a finish changes *what it is made
 * of*, never what colour it is.
 *
 * ---------------------------------------------------------------------------
 * Six of them cost nothing, and one does
 * ---------------------------------------------------------------------------
 * Every finish but `galaxy` is a standard or physical material: it is drawn
 * once when the pointer moves and then the canvas goes back to sleep. `galaxy`
 * has a clock in it, so a shelf with one on it renders continuously - which is
 * why `animates` exists and why the shelf asks rather than assuming.
 */

/**
 * The names, the type and the default all come from `@kxb/xp`.
 *
 * The set belongs to the *document*, not to this renderer: a level declares
 * what it is made of and this file is one of the places that draws it. Two
 * copies of these seven names would be a set that goes out of date the first
 * time one is added, and the failure would be silent - a level whose finish
 * this module has never heard of, drawn as plastic.
 */
export { DEFAULT_FINISH, FINISHES, isFinish } from '@kxb/xp'
export type { Finish as CartridgeFinish } from '@kxb/xp'

/** Whether the shelf has to keep drawing frames for this one. The three with clocks. */
export function animates(finish: CartridgeFinish): boolean {
  return finish === 'galaxy' || finish === 'rainbow' || finish === 'hologram'
}

/**
 * The level's colour, as three.js sees it.
 *
 * `SRGBColorSpace` explicitly, because `Color.setHSL` works in the renderer's
 * linear space by default - the same numbers read as linear give a set of
 * washed-out pastels that look nothing like the hue the card version of this
 * level is lit in.
 */
function tint(hue: number, saturation: number, lightness: number): THREE.Color {
  return new THREE.Color().setHSL(hue / 360, saturation, lightness, THREE.SRGBColorSpace)
}

/**
 * A galaxy in the plastic.
 *
 * ---------------------------------------------------------------------------
 * What is actually being drawn
 * ---------------------------------------------------------------------------
 * Three things stacked, all in *object* space so the pattern belongs to the
 * cartridge and turns with it rather than swimming across it as it leans:
 *
 * 1. **The disc.** Two rotating polar bands, one twice the speed of the other,
 *    which is what makes it read as material falling inward rather than as a
 *    spinning texture. The hue runs along the radius so the inner edge is hot.
 * 2. **The hole.** Everything inside a small radius goes to black, with a hard
 *    shoulder - the thing an accretion disc is drawn around is the absence in
 *    the middle, and a soft fade there just looks like a smudge.
 * 3. **The atmosphere.** A Fresnel term, which is one where a face points away
 *    from you, so every silhouette edge lights up. That is the halo, and it is
 *    what stops the shell from reading as a picture printed on a flat box.
 *
 * Written as a `ShaderMaterial` rather than patched into a standard one because
 * this surface is not lit: it is *emitting*, and a lit material asked to look
 * like it is emitting ends up fighting the scene's key light every frame.
 */
function galaxyMaterial(hue: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    // Opaque and depth-writing, unlike the world's rainbow ghosts: the cover
    // sticker sits five thousandths in front of this and must not be sorted
    // behind it.
    transparent: false,
    depthWrite: true,
    uniforms: {
      uTime: { value: 0 },
      uHue: { value: hue / 360 },
      uGlow: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      varying vec3 vNormalW;
      varying vec3 vViewW;

      void main() {
        vLocal = position;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewW = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uHue;
      uniform float uGlow;

      varying vec3 vLocal;
      varying vec3 vNormalW;
      varying vec3 vViewW;

      /** Hue to RGB, full saturation and value. Six ramps, no branches. */
      vec3 spectrum(float hue) {
        return clamp(abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      }

      float hash(vec2 at) {
        return fract(sin(dot(at, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        // Polar coordinates about the shell's own middle, squashed on x so the
        // disc stays circular on a cartridge that is wider than it is tall.
        vec2 disc = vec2(vLocal.x * 0.86, vLocal.y);
        float radius = length(disc);
        float angle = atan(disc.y, disc.x);

        // Two arms, counter-wound and at different speeds. One is a pinwheel;
        // two is something falling in.
        float inner = sin(angle * 2.0 + radius * 14.0 - uTime * 1.7);
        float outer = sin(angle * 3.0 - radius * 9.0 + uTime * 0.8);
        float arms = 0.5 + 0.5 * (inner * 0.6 + outer * 0.4);

        // The hue runs outward from the level's own colour, a third of the way
        // round the wheel, so every galaxy is recognisably its level's.
        vec3 colour = spectrum(fract(uHue + radius * 0.34 + arms * 0.08));

        float brightness = pow(arms, 2.4) * smoothstep(0.62, 0.16, radius);

        // Stars, on a grid fine enough that the cells are invisible.
        vec2 cell = floor(vLocal.xy * 90.0);
        float star = step(0.985, hash(cell)) * (0.55 + 0.45 * sin(uTime * 3.0 + hash(cell) * 30.0));

        // The hole. A hard shoulder rather than a fade - what a disc is drawn
        // around is the absence in the middle.
        float hole = smoothstep(0.055, 0.115, radius);

        vec3 lit = colour * brightness * hole * 1.7 + vec3(star) * hole;

        // The atmosphere: one over the facing term, so every silhouette burns.
        float facing = abs(dot(normalize(vNormalW), normalize(vViewW)));
        float rim = pow(1.0 - facing, 2.6);
        lit += spectrum(fract(uHue + 0.5)) * rim * 1.5;

        // Deep space underneath, never pure black, so the moulding's own edges
        // still catch the scene's lights.
        lit += vec3(0.035, 0.03, 0.07);

        // What the hover glow does to every other finish, done by hand.
        lit *= 1.0 + uGlow;

        gl_FragColor = vec4(lit, 1.0);
      }
    `,
  })
}

/**
 * The moulded body, in whichever material the level asked for.
 *
 * The grain maps go on every finish that is a solid: even chromed steel has the
 * tool's texture under the plating, and a metal shell with a mirror finish and
 * no grain is the one that reads as a render rather than as an object.
 */
/**
 * Thin film, as an oil slick rather than as physics.
 *
 * `MeshPhysicalMaterial` has real iridescence built in and it was the first
 * thing tried here. It is *correct* and it is nearly invisible on this shape:
 * thin-film interference lives at grazing angles, and a cartridge on a shelf is
 * a flat slab pointed almost straight at you. What came back was a dark teal
 * box with a hint of colour on two edges.
 *
 * So the spectrum is authored instead. The hue is driven by the surface's
 * *tilt* away from the eye plus a slow drift, which means the bands sweep
 * across the shell as it leans toward the pointer - the thing an oil slick
 * actually does, at the strength somebody asked for a rainbow cartridge to have
 * it.
 */
function rainbowMaterial(hue: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    uniforms: {
      uTime: { value: 0 },
      uHue: { value: hue / 360 },
      uGlow: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      varying vec3 vNormalW;
      varying vec3 vViewW;

      void main() {
        vLocal = position;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewW = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uHue;
      uniform float uGlow;

      varying vec3 vLocal;
      varying vec3 vNormalW;
      varying vec3 vViewW;

      vec3 spectrum(float hue) {
        return clamp(abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      }

      void main() {
        vec3 normal = normalize(vNormalW);
        vec3 view = normalize(vViewW);
        float facing = abs(dot(normal, view));

        // The band. Tilt does most of the work so the colours travel when the
        // cartridge leans; the diagonal keeps a flat face from being one flat
        // colour, and the drift keeps it alive while nothing is moving.
        float band = (1.0 - facing) * 1.6
          + (vLocal.x + vLocal.y) * 0.55
          + uTime * 0.06;

        vec3 colour = spectrum(fract(uHue + band));

        // Lit enough to still be an object: a plain spectrum with no shading in
        // it reads as a sticker of a rainbow rather than as a rainbow shell.
        float lambert = 0.45 + 0.55 * max(dot(normal, normalize(vec3(0.4, 0.7, 1.0))), 0.0);
        vec3 lit = colour * lambert;

        // And a white specular sheen where it turns away, which is the wet look
        // that makes an oil slick an oil slick.
        lit += vec3(1.0) * pow(1.0 - facing, 4.0) * 0.7;

        lit *= 1.0 + uGlow;

        gl_FragColor = vec4(lit, 1.0);
      }
    `,
  })
}

/**
 * The shell as a tube rather than as a solid.
 *
 * The other seven finishes are things the neon lines are drawn *on*. This one
 * is the lines: the body goes to almost nothing - a smoked, near-black plastic
 * that swallows the room instead of reflecting it - so what is left of the
 * cartridge is its own outline burning in `neon.ts`, with a wide Fresnel
 * bleeding off every edge to hold the shape between them.
 *
 * Unlit, like the galaxy, and for the same reason: this surface is emitting
 * rather than reflecting, and a lit material asked to look like it is emitting
 * spends every frame arguing with the key light.
 *
 * There is no clock in it. A pulse would be the obvious next thing and would
 * cost the shelf a frame forever - `animates()` is the switch, and a sign that
 * breathes is not worth a canvas that never sleeps.
 */
function tubeMaterial(hue: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    uniforms: {
      uColour: {
        value: new THREE.Color().setHSL(hue / 360, 1, 0.58, THREE.SRGBColorSpace),
      },
      uGlow: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vViewW;

      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewW = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColour;
      uniform float uGlow;

      varying vec3 vNormalW;
      varying vec3 vViewW;

      void main() {
        float facing = abs(dot(normalize(vNormalW), normalize(vViewW)));

        // A wide, soft falloff - 1.4 rather than the halo's 1.7 - so the glow
        // reaches well in from each edge. A tight one leaves a black slab with
        // a line round it, which reads as a hole rather than as glass.
        float edge = pow(1.0 - facing, 1.4);

        // Smoked, not black. The floor is what keeps the front face from
        // vanishing into the page and taking the cover's shadow with it.
        vec3 lit = vec3(0.018, 0.016, 0.03) + uColour * edge * 1.35;

        lit *= 1.0 + uGlow;

        gl_FragColor = vec4(lit, 1.0);
      }
    `,
  })
}

/**
 * A projection of a cartridge rather than a cartridge.
 *
 * ---------------------------------------------------------------------------
 * The three things that make it read as one
 * ---------------------------------------------------------------------------
 * 1. **You can see through it, including its own back.** Double-sided and
 *    additive with no depth written, so the far edges show through the near
 *    face. That is most of the effect: a translucent solid still reads as a
 *    solid, and a shape you can see the *inside* of does not.
 * 2. **Scan lines, in object space.** They belong to the cartridge and turn
 *    with it. Screen-space lines are a filter over the page; these are a thing
 *    the object is made of.
 * 3. **It is unstable.** A band sweeps up it, and a scattering of rows tear
 *    sideways for one frame at a time. A perfectly steady hologram is just a
 *    tinted box - the flaw is the whole tell.
 *
 * ---------------------------------------------------------------------------
 * It has a clock, and that is a decision
 * ---------------------------------------------------------------------------
 * Unlike `neon`, which deliberately does not. A hologram that does not move is
 * not a hologram, so this one keeps the canvas awake for as long as it is on a
 * shelf - see `animates()`. Which is the argument for it being a level's own
 * choice rather than the default: one author opting in costs one shelf a frame
 * loop, and nobody else pays for it.
 */
function hologramMaterial(hue: number, strength: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uColour: {
        value: new THREE.Color().setHSL(hue / 360, 0.85, 0.62, THREE.SRGBColorSpace),
      },
      uStrength: { value: strength },
      uTime: { value: 0 },
      uGlow: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      varying vec3 vNormalW;
      varying vec3 vViewW;

      void main() {
        vLocal = position;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewW = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColour;
      uniform float uStrength;
      uniform float uTime;
      uniform float uGlow;

      varying vec3 vLocal;
      varying vec3 vNormalW;
      varying vec3 vViewW;

      float hash(float at) {
        return fract(sin(at * 12.9898) * 43758.5453);
      }

      void main() {
        float facing = abs(dot(normalize(vNormalW), normalize(vViewW)));
        float edge = pow(1.0 - facing, 1.6);

        // About thirty-five line pairs over a one-unit shell, which is four or
        // five screen pixels at the size a cartridge is drawn - fine enough to
        // read as a raster and coarse enough to survive being scaled down.
        float scan = 0.5 + 0.5 * sin(vLocal.y * 220.0 - uTime * 2.4);

        // The refresh, travelling up. Wrapped rather than ping-ponged, so it
        // never appears to change its mind.
        float band = fract(vLocal.y * 0.5 + 0.5 - uTime * 0.16);
        float sweep = exp(-pow((band - 0.5) * 5.5, 2.0));

        // One row in a hundred tears, and only for a frame. Quantised on both
        // axes - the row and the moment - so it snaps rather than slides.
        float row = floor(vLocal.y * 110.0);
        float tear = step(0.986, hash(row + floor(uTime * 7.0) * 31.0));

        float lit = 0.10 + scan * 0.14 + edge * 0.5 + sweep * 0.26 + tear * 0.55;
        lit *= uStrength * (1.0 + uGlow);

        gl_FragColor = vec4(uColour * lit, lit);
      }
    `,
  })
}

export function shellMaterial(finish: CartridgeFinish, hue: number): THREE.Material {
  const grain = plasticGrain()

  const glow = {
    emissive: tint(hue, 0.7, 0.5),
    emissiveIntensity: 0,
  }

  switch (finish) {
    case 'shiny': {
      // Moulded plastic with a lacquer over it: the body is still rough, and
      // the shine is a clearcoat on top rather than the body being polished -
      // which is the difference between a glossy toy and a wet-looking one.
      const material = new THREE.MeshPhysicalMaterial({
        color: tint(hue, 0.55, 0.34),
        roughness: 0.55,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        // Well above one, and that is not a fudge: the room is a *byte*
        // texture, so nothing in it is brighter than white, and a lacquer
        // reflecting a white-clamped strip light is a dull grey smear. The
        // intensity is what puts the highlight back where an HDR would have
        // had one.
        envMapIntensity: 1.6,
        normalMap: grain.normal,
        ...glow,
      })
      material.normalScale.set(0.2, 0.2)
      return material
    }

    case 'metal': {
      const material = new THREE.MeshStandardMaterial({
        // Barely tinted. A fully saturated metal is a coloured mirror, which
        // reads as plastic again; the hue belongs in the reflection, not the
        // albedo.
        color: tint(hue, 0.14, 0.8),
        roughness: 0.2,
        metalness: 1,
        // The highest of the set. A metal has no diffuse at all - everything
        // you see in it is the room - so in a room this dark it is the only
        // number keeping the shell from being a black slab.
        envMapIntensity: 2.6,
        roughnessMap: grain.roughness,
        normalMap: grain.normal,
        ...glow,
      })
      material.normalScale.set(0.14, 0.14)
      return material
    }

    case 'rust': {
      const material = new THREE.MeshStandardMaterial({
        map: rustMottle(),
        // Tinted rather than replaced, so a level's colour still shows through
        // the oxide instead of every rusted cartridge being the same brown.
        color: tint(hue, 0.3, 0.95),
        roughness: 1,
        envMapIntensity: 0.9,
        // Part metal, because the bare patches are: a fully dielectric rust
        // has no glints in it at all and looks like brown paint.
        metalness: 0.55,
        roughnessMap: grain.roughness,
        normalMap: grain.normal,
        ...glow,
      })
      // Hard, because pitting is the whole point of rust.
      material.normalScale.set(1.1, 1.1)
      return material
    }

    case 'glass': {
      // A clear shell - the smoked cartridges, where you can see the board.
      // `transmission` rather than `opacity`: a translucent object that still
      // writes depth is what keeps the cover sticker sorted in front of it,
      // which plain transparency on twenty-four overlapping shells does not.
      return new THREE.MeshPhysicalMaterial({
        color: tint(hue, 0.35, 0.7),
        roughness: 0.16,
        metalness: 0,
        transmission: 0.9,
        thickness: 0.35,
        ior: 1.52,
        envMapIntensity: 1.2,
        ...glow,
      })
    }

    case 'rainbow':
      return rainbowMaterial(hue)

    case 'galaxy':
      return galaxyMaterial(hue)

    case 'neon':
      return tubeMaterial(hue)

    case 'hologram':
      return hologramMaterial(hue, 1)

    case 'plastic':
    default: {
      const material = new THREE.MeshStandardMaterial({
        color: tint(hue, 0.4, 0.34),
        // Fully rough, and the map only ever polishes - see `grain.ts`.
        roughness: 1,
        metalness: 0,
        // Low, because matte plastic reflects a room only as a slight lift in
        // the shadows - any more and it stops being matte.
        envMapIntensity: 0.55,
        roughnessMap: grain.roughness,
        normalMap: grain.normal,
        ...glow,
      })
      material.normalScale.set(0.35, 0.35)
      return material
    }
  }
}

/**
 * The sticker well and the pin comb.
 *
 * Always a solid, whatever the shell is, and always paler. Two reasons, and
 * neither is aesthetic: the well is the surface a cover sits *on*, so a
 * transmissive or emitting one would show through the picture; and the comb is
 * the contact strip, which on a real cartridge is the one part that is plated
 * rather than moulded. A galaxy cartridge with galaxy pins is a galaxy-shaped
 * blob.
 */
export function plateMaterial(finish: CartridgeFinish, hue: number): THREE.Material {
  const grain = plasticGrain()

  const metallic = finish === 'metal' || finish === 'rainbow' || finish === 'rust'

  /*
    The one exception to "the plate is always a pale solid".

    A `neon` cartridge whose sticker well and pin comb were the usual near-white
    would be a bright rectangle with a glowing frame round it - the plate would
    become the object and the tube would become its border. Dark, and the comb's
    own neon lines do the work.
  */
  /*
    The plate is projected too, or it is not a hologram.

    A solid sticker well and a solid pin comb inside a translucent shell would
    read as a real cartridge behind a coloured pane. Dimmer than the shell, so
    the comb's fins stay separate rather than merging into one bright bar.
  */
  if (finish === 'hologram') return hologramMaterial(hue, 0.7)

  if (finish === 'neon') {
    return new THREE.MeshStandardMaterial({
      color: tint(hue, 0.5, 0.09),
      roughness: 0.42,
      metalness: 0.1,
      envMapIntensity: 0.5,
      emissive: tint(hue, 0.9, 0.42),
      emissiveIntensity: 0,
    })
  }

  const material = new THREE.MeshStandardMaterial({
    color: metallic ? tint(hue, 0.08, 0.82) : tint(hue, 0.12, 0.66),
    roughness: metallic ? 0.3 : 1,
    metalness: metallic ? 0.85 : 0,
    envMapIntensity: metallic ? 2.2 : 0.5,
    roughnessMap: grain.roughness,
    normalMap: grain.normal,
    emissive: tint(hue, 0.7, 0.5),
    emissiveIntensity: 0,
  })
  material.normalScale.set(0.24, 0.24)
  return material
}
