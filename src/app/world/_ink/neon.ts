/**
 * The ink itself: a WebGL pen that draws light rather than paint.
 *
 * A 2D canvas can do a glowing line - `shadowBlur` and a couple of passes -
 * and it looks like a line with a blur behind it. Neon is not a blur. It is a
 * white-hot core with colour bleeding off it, brighter where strokes cross
 * because light adds, and that is three things a rasteriser gives away for
 * free once the ribbon is on the GPU: additive blending does the crossings,
 * one exponential in the fragment shader does the falloff, and the core is
 * just the same falloff raised to a power.
 *
 * The whole surface is redrawn every frame rather than accumulated, which
 * sounds wasteful and is not: a stroke is a few dozen points, the strokes on
 * screen at once are counted in tens, and drawing fresh is what lets ink fade
 * by *age* - each point carries how long ago the finger was there, so a stroke
 * dissolves from its tail the way a sparkler does, rather than the whole line
 * dimming together.
 *
 * Two passes per stroke, both from the same buffer: a wide dim one for the
 * halo and a narrow bright one for the filament. That pair is the entire
 * difference between "a coloured line" and "a tube of gas somebody has run a
 * current through".
 *
 * This file knows nothing about letters, words or the room. It is handed
 * points and told how bright to make them; see `ink-layer.tsx` for who decides.
 */

import type { Pt } from '@/app/world/_ink/points'

/** Floats per vertex: position, normal, side, age, along. */
const STRIDE = 7

const VERTEX = `
precision highp float;

attribute vec2 aPos;
attribute vec2 aNormal;
attribute float aSide;
attribute float aAge;
attribute float aAlong;

uniform vec2 uViewport;
uniform float uWidth;
uniform float uPassWidth;
uniform float uScale;
uniform vec2 uOrigin;
uniform float uTaper;

varying float vSide;
varying float vAge;

void main() {
  /* Thin at both ends, fattest in the middle: a pen leaves the paper the way
     it lands on it, and a ribbon of constant width reads as tape.

     Switched off for a shape that closes on itself, where there are no ends to
     taper - the two thin tips meet and leave a notch in the circle instead. */
  float taper = mix(1.0, 0.45 + 0.55 * sin(clamp(aAlong, 0.0, 1.0) * 3.14159265), uTaper);

  /* The burst scales the *path* about a point but never the width, which is
     why this is two steps rather than one matrix: ink flying outwards should
     get longer, not blobbier. */
  vec2 p = (aPos - uOrigin) * uScale + uOrigin;
  p += aNormal * aSide * uWidth * uPassWidth * taper;

  vec2 clip = (p / uViewport) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);

  vSide = aSide;
  vAge = aAge;
}
`

const FRAGMENT = `
precision highp float;

uniform vec3 uColour;
uniform float uSharp;
uniform float uEnergy;
uniform float uLife;

varying float vSide;
varying float vAge;

void main() {
  /* Distance across the ribbon, 0 down the middle and 1 at each edge. The
     gaussian is the glow; the same value raised to a power is the filament,
     and mixing towards white by it is what makes a hot line look hot rather
     than pale. */
  float across = abs(vSide);
  float core = exp(-across * across * uSharp);

  /* Squared, so ink holds its brightness and then goes, rather than spending
     its whole life half there. */
  float left = clamp(1.0 - vAge / uLife, 0.0, 1.0);
  float bright = core * left * left * uEnergy;

  vec3 rgb = mix(uColour, vec3(1.0), pow(core, 4.0));

  /* Premultiplied: the canvas composites this over the room, and additive
     blending means two strokes crossing are brighter than either. */
  gl_FragColor = vec4(rgb * bright, bright);
}
`

const FLASH_VERTEX = `
precision highp float;
attribute vec2 aClip;
void main() { gl_Position = vec4(aClip, 0.0, 1.0); }
`

const FLASH_FRAGMENT = `
precision highp float;
uniform vec3 uColour;
uniform float uAmount;
void main() { gl_FragColor = vec4(uColour * uAmount, uAmount); }
`

export interface StrokeSpec {
  points: readonly Pt[]
  /** How long ago each point was drawn, in seconds. Same length as `points`. */
  ages: readonly number[]
  /** Degrees round the wheel. */
  hue: number
  /** Half-width of the filament, in CSS pixels. */
  width: number
  /** Brightness multiplier. 1 is a normal stroke. */
  energy: number
  /** How long this ink lives, in seconds. */
  life: number
  /** Expansion about `origin`. 1 is where it was drawn. */
  scale?: number
  origin?: Pt
  /**
   * Whether the ribbon thins towards its ends. True for anything a hand drew;
   * false for a closed shape, whose ends are each other.
   */
  taper?: boolean
}

export interface Neon {
  resize: (width: number, height: number, dpr: number) => void
  /** Clear the frame. Everything drawn after this is this frame's. */
  begin: () => void
  draw: (spec: StrokeSpec) => void
  /** A wash over the whole screen. `amount` is 0 to about 0.6. */
  flash: (amount: number, hue: number) => void
  destroy: () => void
}

function compile(gl: WebGLRenderingContext, vertex: string, fragment: string) {
  const program = gl.createProgram()
  if (!program) return null

  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type)
    if (!shader) return null
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      // Left in production deliberately: a shader that fails to compile draws
      // nothing at all, which on an overlay looks exactly like a feature that
      // was never wired up.
      console.error('[ink] shader:', gl.getShaderInfoLog(shader))
      return null
    }
    gl.attachShader(program, shader)
    // Attached shaders are kept alive by the program, so this is the delete
    // that does not need to wait for `destroy`.
    gl.deleteShader(shader)
  }

  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('[ink] link:', gl.getProgramInfoLog(program))
    return null
  }
  return program
}

/** Hue in degrees to a bright, saturated rgb. Lightness is the shader's job. */
function hueToRgb(hue: number): [number, number, number] {
  const h = (((hue % 360) + 360) % 360) / 60
  const x = 1 - Math.abs((h % 2) - 1)
  const table: [number, number, number][] = [
    [1, x, 0],
    [x, 1, 0],
    [0, 1, x],
    [0, x, 1],
    [x, 0, 1],
    [1, 0, x],
  ]
  const rgb = table[Math.floor(h) % 6]
  // Lifted off the pure hue: a fully saturated channel at zero reads as a
  // filter, and neon tubes glow a little into their neighbours.
  return [rgb[0] * 0.85 + 0.15, rgb[1] * 0.85 + 0.15, rgb[2] * 0.85 + 0.15]
}

export function createNeon(canvas: HTMLCanvasElement): Neon | null {
  const gl = (canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    depth: false,
    premultipliedAlpha: true,
  }) ?? canvas.getContext('webgl', { alpha: true, antialias: true, depth: false })) as
    | WebGLRenderingContext
    | null
  if (!gl) return null

  const program = compile(gl, VERTEX, FRAGMENT)
  const flashProgram = compile(gl, FLASH_VERTEX, FLASH_FRAGMENT)
  const buffer = gl.createBuffer()
  const flashBuffer = gl.createBuffer()
  if (!program || !flashProgram || !buffer || !flashBuffer) return null

  const attributes = {
    pos: gl.getAttribLocation(program, 'aPos'),
    normal: gl.getAttribLocation(program, 'aNormal'),
    side: gl.getAttribLocation(program, 'aSide'),
    age: gl.getAttribLocation(program, 'aAge'),
    along: gl.getAttribLocation(program, 'aAlong'),
  }
  const uniforms = {
    viewport: gl.getUniformLocation(program, 'uViewport'),
    width: gl.getUniformLocation(program, 'uWidth'),
    passWidth: gl.getUniformLocation(program, 'uPassWidth'),
    scale: gl.getUniformLocation(program, 'uScale'),
    taper: gl.getUniformLocation(program, 'uTaper'),
    origin: gl.getUniformLocation(program, 'uOrigin'),
    colour: gl.getUniformLocation(program, 'uColour'),
    sharp: gl.getUniformLocation(program, 'uSharp'),
    energy: gl.getUniformLocation(program, 'uEnergy'),
    life: gl.getUniformLocation(program, 'uLife'),
  }
  const flashAttribute = gl.getAttribLocation(flashProgram, 'aClip')
  const flashUniforms = {
    colour: gl.getUniformLocation(flashProgram, 'uColour'),
    amount: gl.getUniformLocation(flashProgram, 'uAmount'),
  }

  // One triangle big enough to cover the clip cube, which is cheaper than two
  // and has no seam down the diagonal.
  gl.bindBuffer(gl.ARRAY_BUFFER, flashBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)

  gl.disable(gl.DEPTH_TEST)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE)

  /** CSS pixels, which is what strokes and widths are stated in. */
  let viewport = { width: canvas.width, height: canvas.height }

  /** Grown as needed and then kept: a stroke a frame must not be an allocation a frame. */
  let vertices = new Float32Array(STRIDE * 2 * 256)

  const build = (spec: StrokeSpec): number => {
    const { points, ages } = spec
    const count = Math.min(points.length, ages.length)
    if (count < 2) return 0

    const needed = STRIDE * 2 * count
    if (vertices.length < needed) vertices = new Float32Array(needed * 2)

    let at = 0
    for (let i = 0; i < count; i++) {
      // The tangent spans the neighbours rather than the next point, so a
      // shaky hand does not put a kink in the ribbon at every sample.
      const previous = points[Math.max(i - 1, 0)]
      const next = points[Math.min(i + 1, count - 1)]
      let tx = next.x - previous.x
      let ty = next.y - previous.y
      const length = Math.hypot(tx, ty) || 1
      tx /= length
      ty /= length

      const along = count > 1 ? i / (count - 1) : 0
      for (const side of [-1, 1]) {
        vertices[at++] = points[i].x
        vertices[at++] = points[i].y
        vertices[at++] = -ty
        vertices[at++] = tx
        vertices[at++] = side
        vertices[at++] = ages[i]
        vertices[at++] = along
      }
    }
    return count * 2
  }

  return {
    resize(width, height, dpr) {
      viewport = { width, height }
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
    },

    begin() {
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
    },

    draw(spec) {
      const count = build(spec)
      if (count === 0) return

      gl.useProgram(program)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, count * STRIDE), gl.DYNAMIC_DRAW)

      const bytes = STRIDE * 4
      gl.enableVertexAttribArray(attributes.pos)
      gl.vertexAttribPointer(attributes.pos, 2, gl.FLOAT, false, bytes, 0)
      gl.enableVertexAttribArray(attributes.normal)
      gl.vertexAttribPointer(attributes.normal, 2, gl.FLOAT, false, bytes, 8)
      gl.enableVertexAttribArray(attributes.side)
      gl.vertexAttribPointer(attributes.side, 1, gl.FLOAT, false, bytes, 16)
      gl.enableVertexAttribArray(attributes.age)
      gl.vertexAttribPointer(attributes.age, 1, gl.FLOAT, false, bytes, 20)
      gl.enableVertexAttribArray(attributes.along)
      gl.vertexAttribPointer(attributes.along, 1, gl.FLOAT, false, bytes, 24)

      const origin = spec.origin ?? { x: 0, y: 0 }
      gl.uniform2f(uniforms.viewport, viewport.width, viewport.height)
      gl.uniform1f(uniforms.width, spec.width)
      gl.uniform1f(uniforms.scale, spec.scale ?? 1)
      gl.uniform1f(uniforms.taper, spec.taper === false ? 0 : 1)
      gl.uniform2f(uniforms.origin, origin.x, origin.y)
      gl.uniform3fv(uniforms.colour, hueToRgb(spec.hue))
      gl.uniform1f(uniforms.life, Math.max(spec.life, 0.001))

      /*
        The halo first, then the filament over it. Wide and soft, then narrow
        and hot - and the halo's energy is a fraction of the core's because
        additive blending means the two are summed where they overlap, which is
        exactly down the middle of every stroke.
      */
      gl.uniform1f(uniforms.passWidth, 7)
      gl.uniform1f(uniforms.sharp, 3.2)
      gl.uniform1f(uniforms.energy, spec.energy * 0.32)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, count)

      gl.uniform1f(uniforms.passWidth, 1)
      gl.uniform1f(uniforms.sharp, 9)
      gl.uniform1f(uniforms.energy, spec.energy)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, count)
    },

    flash(amount, hue) {
      if (amount <= 0) return
      gl.useProgram(flashProgram)
      gl.bindBuffer(gl.ARRAY_BUFFER, flashBuffer)
      gl.enableVertexAttribArray(flashAttribute)
      gl.vertexAttribPointer(flashAttribute, 2, gl.FLOAT, false, 0, 0)
      gl.uniform3fv(flashUniforms.colour, hueToRgb(hue))
      gl.uniform1f(flashUniforms.amount, amount)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },

    destroy() {
      /*
        The programs and buffers go; the *context* stays. Calling
        `WEBGL_lose_context.loseContext()` here is what killed the strict-mode
        remount elsewhere in this app - the second mount gets a dead context and
        draws a blank canvas with no error anywhere.
      */
      gl.deleteProgram(program)
      gl.deleteProgram(flashProgram)
      gl.deleteBuffer(buffer)
      gl.deleteBuffer(flashBuffer)
    },
  }
}
