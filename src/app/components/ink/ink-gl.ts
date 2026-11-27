import {
  ADVECTION,
  BLUR,
  CLEAR,
  COPY,
  CURL,
  DISPLAY,
  DIVERGENCE,
  GRADIENT_SUBTRACT,
  PRESSURE,
  SPLAT,
  VERTEX,
  VORTICITY,
} from '@/app/components/ink/ink-glsl'

/**
 * The fluid, as a machine.
 *
 * This file owns the WebGL2 context and every texture in it, and exposes
 * four verbs: `ink` puts colour in, `push` puts motion in, `step` runs one
 * step of the solver, `draw` shows the result. Nothing in here decides *what* to
 * ink or *where* to push - that is ./ink-life, which speaks in uv and seconds
 * and never sees a texel. The split matters because this file changes when the
 * solver changes, and that one changes whenever somebody wants the picture to
 * behave differently, and they should not be the same edit.
 *
 * Units, because they are the thing that goes wrong: positions are uv, with y
 * up. Radii are fractions of the canvas height. Velocity is stored in texels
 * of the velocity grid per second, which is what the advection shader wants,
 * but `push` takes uv per second and converts, so callers can say "a fifth of
 * the screen per second" without knowing how coarse the grid is.
 */

/** The velocity grid's short side. Coarse on purpose: smoke is smooth. */
const SIM_SIZE = 256
/** The glow is drawn at a fraction of the dye; a wide blur wants few texels. */
const GLOW_SCALE = 1 / 6
/** How many Jacobi passes the pressure gets. Twenty is soft; more is stiffer. */
const PRESSURE_ITERATIONS = 20

export type InkParams = {
  /** Vorticity confinement strength. Around thirty reads as smoke. */
  curl: number
  /** Per-second decay of the ink. */
  dyeDissipation: number
  /** Per-second decay of the motion. */
  velocityDissipation: number
  /** How much of last frame's pressure to keep as the next guess. */
  pressure: number
  /** Below this the glow prefilter sees nothing. */
  glowThreshold: number
  /** How much of the water's iridescence the display adds. */
  iris: number
  /** Gain on the glow in the display. */
  glow: number
  /** How much of the picture is the blob look, 0..1. */
  blob: number
}

export const DEFAULT_PARAMS: InkParams = {
  curl: 28,
  dyeDissipation: 0.4,
  velocityDissipation: 0.18,
  pressure: 0.8,
  glowThreshold: 0.18,
  iris: 1.0,
  glow: 0.7,
  blob: 0,
}

/**
 * The solver, tuned for a given amount of blob: smoke wants curl and a
 * quick fade, blob wants almost no curl, a long-lived dye and a velocity
 * that dies fast so the shapes drift in waves instead of shredding.
 */
export function paramsFor(blob: number, iris: number, glow: number): InkParams {
  const k = Math.max(0, Math.min(1, blob))
  return {
    curl: 28 + (4 - 28) * k,
    dyeDissipation: 0.4 + (0.22 - 0.4) * k,
    velocityDissipation: 0.18 + (0.6 - 0.18) * k,
    pressure: 0.8,
    glowThreshold: 0.18 + (0.04 - 0.18) * k,
    iris,
    glow,
    blob: k,
  }
}

export type Ink = {
  /** Add colour at a point. `amount` is what the centre of the blob receives. */
  ink(x: number, y: number, rgb: readonly [number, number, number], amount: number, radius: number): void
  /** Add velocity at a point, in uv per second. */
  push(x: number, y: number, u: number, v: number, radius: number): void
  /** Advance the solver by `dt` seconds. */
  step(dt: number): void
  /** Draw the current state to the canvas; `time` is seconds, for the stars. */
  draw(time: number): void
  /** Change the tuning; takes effect on the next step and draw. */
  tune(next: InkParams): void
  /** Re-fit every target to the canvas. Loses the picture; called on resize. */
  resize(): void
  /** Width over height of the canvas. */
  aspect(): number
  /** One texel from the middle of each field, for a debugger. Slow; never per frame. */
  probe(): { velocity: number[]; dye: number[]; pressure: number[]; size: number[] }
  dispose(): void
}

type Target = {
  texture: WebGLTexture
  fbo: WebGLFramebuffer
  width: number
  height: number
  texelX: number
  texelY: number
}

type Pair = {
  read: Target
  write: Target
  swap(): void
  width: number
  height: number
  texelX: number
  texelY: number
}

type Program = {
  program: WebGLProgram
  uniforms: Record<string, WebGLUniformLocation | null>
}

type Formats = {
  rgba: { internal: number; format: number }
  rg: { internal: number; format: number }
  r: { internal: number; format: number }
  type: number
}

/**
 * Build the machine on a canvas, or return null where it cannot run.
 *
 * It needs WebGL2 and a float-renderable extension; every browser this app
 * otherwise runs in has both, but the null is honoured by the scene rather
 * than throwing, because a page that stays black is better than a page that
 * crashes on a projector nobody can reach.
 */
export function createInk(canvas: HTMLCanvasElement, initial: InkParams = DEFAULT_PARAMS): Ink | null {
  let params = initial
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    depth: false,
    stencil: false,
    antialias: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  })
  if (!gl || gl.isContextLost()) return null

  const formats = pickFormats(gl)
  if (!formats) return null

  gl.disable(gl.BLEND)
  gl.disable(gl.DEPTH_TEST)

  // One triangle covering clip space; the vertex shader turns it into uv.
  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  const programs = {
    copy: compile(gl, COPY),
    clear: compile(gl, CLEAR),
    splat: compile(gl, SPLAT),
    advection: compile(gl, ADVECTION),
    divergence: compile(gl, DIVERGENCE),
    curl: compile(gl, CURL),
    vorticity: compile(gl, VORTICITY),
    pressure: compile(gl, PRESSURE),
    gradient: compile(gl, GRADIENT_SUBTRACT),
    blur: compile(gl, BLUR),
    display: compile(gl, DISPLAY),
  }

  let velocity!: Pair
  let dye!: Pair
  let pressure!: Pair
  let glow!: Pair
  let divergence!: Target
  let curl!: Target

  const allocate = () => {
    const w = Math.max(1, canvas.width)
    const h = Math.max(1, canvas.height)
    const ratio = w / h
    const simW = ratio >= 1 ? Math.round(SIM_SIZE * ratio) : SIM_SIZE
    const simH = ratio >= 1 ? SIM_SIZE : Math.round(SIM_SIZE / ratio)
    const glowW = Math.max(1, Math.round(w * GLOW_SCALE))
    const glowH = Math.max(1, Math.round(h * GLOW_SCALE))

    velocity = createPair(gl, simW, simH, formats.rg, formats.type)
    dye = createPair(gl, w, h, formats.rgba, formats.type)
    pressure = createPair(gl, simW, simH, formats.r, formats.type)
    glow = createPair(gl, glowW, glowH, formats.rgba, formats.type)
    divergence = createTarget(gl, simW, simH, formats.r, formats.type)
    curl = createTarget(gl, simW, simH, formats.r, formats.type)
  }

  const release = () => {
    for (const pair of [velocity, dye, pressure, glow]) {
      if (!pair) continue
      for (const t of [pair.read, pair.write]) {
        gl.deleteTexture(t.texture)
        gl.deleteFramebuffer(t.fbo)
      }
    }
    for (const t of [divergence, curl]) {
      if (!t) continue
      gl.deleteTexture(t.texture)
      gl.deleteFramebuffer(t.fbo)
    }
  }

  allocate()

  const run = (p: Program) => gl.useProgram(p.program)

  const blit = (target: Target | null) => {
    if (target) {
      gl.viewport(0, 0, target.width, target.height)
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    } else {
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  const bind = (texture: WebGLTexture, unit: number) => {
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    return unit
  }

  const splat = (pair: Pair, x: number, y: number, r: number, g: number, b: number, radius: number) => {
    run(programs.splat)
    gl.uniform2f(programs.splat.uniforms.texelSize, pair.texelX, pair.texelY)
    gl.uniform1i(programs.splat.uniforms.uTarget, bind(pair.read.texture, 0))
    gl.uniform1f(programs.splat.uniforms.aspectRatio, canvas.width / canvas.height)
    gl.uniform2f(programs.splat.uniforms.point, x, y)
    gl.uniform3f(programs.splat.uniforms.color, r, g, b)
    gl.uniform1f(programs.splat.uniforms.radius, radius * radius)
    blit(pair.write)
    pair.swap()
  }

  const ink: Ink = {
    aspect: () => canvas.width / canvas.height,

    ink(x, y, rgb, amount, radius) {
      splat(dye, x, y, rgb[0] * amount, rgb[1] * amount, rgb[2] * amount, radius)
    },

    push(x, y, u, v, radius) {
      splat(velocity, x, y, u * velocity.width, v * velocity.height, 0, radius)
    },

    step(dt) {
      // Curl, then confine it. The curl texture is kept around for the display.
      run(programs.curl)
      gl.uniform2f(programs.curl.uniforms.texelSize, velocity.texelX, velocity.texelY)
      gl.uniform1i(programs.curl.uniforms.uVelocity, bind(velocity.read.texture, 0))
      blit(curl)

      run(programs.vorticity)
      gl.uniform2f(programs.vorticity.uniforms.texelSize, velocity.texelX, velocity.texelY)
      gl.uniform1i(programs.vorticity.uniforms.uVelocity, bind(velocity.read.texture, 0))
      gl.uniform1i(programs.vorticity.uniforms.uCurl, bind(curl.texture, 1))
      gl.uniform1f(programs.vorticity.uniforms.curl, params.curl)
      gl.uniform1f(programs.vorticity.uniforms.dt, dt)
      blit(velocity.write)
      velocity.swap()

      // Project: divergence, relax the pressure, subtract its gradient.
      run(programs.divergence)
      gl.uniform2f(programs.divergence.uniforms.texelSize, velocity.texelX, velocity.texelY)
      gl.uniform1i(programs.divergence.uniforms.uVelocity, bind(velocity.read.texture, 0))
      blit(divergence)

      run(programs.clear)
      gl.uniform2f(programs.clear.uniforms.texelSize, pressure.texelX, pressure.texelY)
      gl.uniform1i(programs.clear.uniforms.uTexture, bind(pressure.read.texture, 0))
      gl.uniform1f(programs.clear.uniforms.value, params.pressure)
      blit(pressure.write)
      pressure.swap()

      run(programs.pressure)
      gl.uniform2f(programs.pressure.uniforms.texelSize, velocity.texelX, velocity.texelY)
      gl.uniform1i(programs.pressure.uniforms.uDivergence, bind(divergence.texture, 0))
      for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(programs.pressure.uniforms.uPressure, bind(pressure.read.texture, 1))
        blit(pressure.write)
        pressure.swap()
      }

      run(programs.gradient)
      gl.uniform2f(programs.gradient.uniforms.texelSize, velocity.texelX, velocity.texelY)
      gl.uniform1i(programs.gradient.uniforms.uPressure, bind(pressure.read.texture, 0))
      gl.uniform1i(programs.gradient.uniforms.uVelocity, bind(velocity.read.texture, 1))
      blit(velocity.write)
      velocity.swap()

      // Carry the velocity along itself, then the dye along the velocity.
      run(programs.advection)
      gl.uniform2f(programs.advection.uniforms.texelSize, velocity.texelX, velocity.texelY)
      gl.uniform1i(programs.advection.uniforms.uVelocity, bind(velocity.read.texture, 0))
      gl.uniform1i(programs.advection.uniforms.uSource, 0)
      gl.uniform1f(programs.advection.uniforms.dt, dt)
      gl.uniform1f(programs.advection.uniforms.dissipation, params.velocityDissipation)
      blit(velocity.write)
      velocity.swap()

      gl.uniform1i(programs.advection.uniforms.uVelocity, bind(velocity.read.texture, 0))
      gl.uniform1i(programs.advection.uniforms.uSource, bind(dye.read.texture, 1))
      gl.uniform1f(programs.advection.uniforms.dissipation, params.dyeDissipation)
      blit(dye.write)
      dye.swap()
    },

    tune(next) {
      params = next
    },

    draw(time) {
      // The glow: a thresholded, shrunken copy of the dye, blurred twice each way.
      run(programs.copy)
      gl.uniform2f(programs.copy.uniforms.texelSize, glow.texelX, glow.texelY)
      gl.uniform1i(programs.copy.uniforms.uTexture, bind(dye.read.texture, 0))
      gl.uniform1f(programs.copy.uniforms.uThreshold, params.glowThreshold)
      blit(glow.write)
      glow.swap()

      run(programs.blur)
      gl.uniform2f(programs.blur.uniforms.texelSize, glow.texelX, glow.texelY)
      for (let i = 0; i < 2; i++) {
        gl.uniform1i(programs.blur.uniforms.uTexture, bind(glow.read.texture, 0))
        gl.uniform2f(programs.blur.uniforms.uDirection, glow.texelX, 0)
        blit(glow.write)
        glow.swap()
        gl.uniform1i(programs.blur.uniforms.uTexture, bind(glow.read.texture, 0))
        gl.uniform2f(programs.blur.uniforms.uDirection, 0, glow.texelY)
        blit(glow.write)
        glow.swap()
      }

      run(programs.display)
      gl.uniform2f(programs.display.uniforms.texelSize, dye.texelX, dye.texelY)
      gl.uniform1i(programs.display.uniforms.uDye, bind(dye.read.texture, 0))
      gl.uniform1i(programs.display.uniforms.uGlow, bind(glow.read.texture, 1))
      gl.uniform1i(programs.display.uniforms.uCurl, bind(curl.texture, 2))
      gl.uniform1f(programs.display.uniforms.uIris, params.iris)
      gl.uniform1f(programs.display.uniforms.uGlowGain, params.glow)
      gl.uniform1f(programs.display.uniforms.uBlob, params.blob)
      gl.uniform1f(programs.display.uniforms.uTime, time)
      blit(null)
    },

    resize() {
      release()
      allocate()
    },

    probe() {
      const read = (t: Target) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo)
        const out = new Float32Array(4)
        gl.readPixels(Math.floor(t.width / 2), Math.floor(t.height / 2), 1, 1, gl.RGBA, gl.FLOAT, out)
        return Array.from(out)
      }
      return {
        velocity: read(velocity.read),
        dye: read(dye.read),
        pressure: read(pressure.read),
        size: [canvas.width, canvas.height, velocity.width, velocity.height],
      }
    },

    dispose() {
      release()
      for (const p of Object.values(programs)) gl.deleteProgram(p.program)
      gl.deleteBuffer(quad)
      // The context itself is left alone, on purpose. `WEBGL_lose_context`
      // sounds like the tidy thing to call here and it was: React in
      // development mounts an effect, cleans it up and mounts it again on the
      // *same* canvas, and a canvas whose context was lost that way hands the
      // second mount the same dead context forever - a flat white canvas with
      // no error anywhere. The browser reclaims the context with the element.
    },
  }

  return ink
}

/**
 * Half-float everywhere, because the dye is additive and goes well past one,
 * and the pressure solve wants precision the 8-bit formats do not have.
 * `EXT_color_buffer_float` makes the one- and two-channel half floats
 * renderable; where only the older half-float extension exists, everything
 * falls back to four channels, which costs memory and nothing else.
 */
function pickFormats(gl: WebGL2RenderingContext): Formats | null {
  const full = gl.getExtension('EXT_color_buffer_float')
  const half = full ? null : gl.getExtension('EXT_color_buffer_half_float')
  if (!full && !half) return null

  const type = gl.HALF_FLOAT
  const rgba = { internal: gl.RGBA16F, format: gl.RGBA }
  const rg = { internal: gl.RG16F, format: gl.RG }
  const r = { internal: gl.R16F, format: gl.RED }

  const renderable = (f: { internal: number; format: number }) => {
    const target = createTarget(gl, 4, 4, f, type)
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
    gl.deleteTexture(target.texture)
    gl.deleteFramebuffer(target.fbo)
    return ok
  }

  if (!renderable(rgba)) return null
  return {
    rgba,
    rg: renderable(rg) ? rg : rgba,
    r: renderable(r) ? r : rgba,
    type,
  }
}

function createTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  f: { internal: number; format: number },
  type: number,
): Target {
  const texture = gl.createTexture()!
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, f.internal, width, height, 0, f.format, type, null)

  const fbo = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  gl.viewport(0, 0, width, height)
  gl.clearColor(0, 0, 0, 1)
  gl.clear(gl.COLOR_BUFFER_BIT)

  return { texture, fbo, width, height, texelX: 1 / width, texelY: 1 / height }
}

/** Two targets and a swap, for every field that reads itself while writing. */
function createPair(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  f: { internal: number; format: number },
  type: number,
): Pair {
  const a = createTarget(gl, width, height, f, type)
  const b = createTarget(gl, width, height, f, type)
  const pair: Pair = {
    read: a,
    write: b,
    swap() {
      const t = pair.read
      pair.read = pair.write
      pair.write = t
    },
    width,
    height,
    texelX: 1 / width,
    texelY: 1 / height,
  }
  return pair
}

function compile(gl: WebGL2RenderingContext, fragment: string): Program {
  const vs = shader(gl, gl.VERTEX_SHADER, VERTEX)
  const fs = shader(gl, gl.FRAGMENT_SHADER, fragment)
  const program = gl.createProgram()!
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.bindAttribLocation(program, 0, 'aPosition')
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`ink: link failed: ${gl.getProgramInfoLog(program) ?? ''}`)
  }
  gl.deleteShader(vs)
  gl.deleteShader(fs)

  const uniforms: Record<string, WebGLUniformLocation | null> = {}
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i)
    if (info) uniforms[info.name] = gl.getUniformLocation(program, info.name)
  }
  return { program, uniforms }
}

function shader(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader {
  const s = gl.createShader(kind)!
  gl.shaderSource(s, source)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(`ink: shader failed: ${gl.getShaderInfoLog(s) ?? ''}`)
  }
  return s
}
