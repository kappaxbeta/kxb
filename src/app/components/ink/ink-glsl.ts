/**
 * The ink, as shaders.
 *
 * A stable-fluids solver in the Stam / Dobryakov lineage: a velocity field and
 * a dye field, each advected along the velocity, with a pressure solve every
 * frame that keeps the velocity divergence-free (so the ink swirls instead of
 * piling up) and a vorticity-confinement pass that puts back the curl the
 * coarse grid keeps smoothing away (so the swirls stay sharp instead of
 * fading into mush). Everything here is one full-screen pass reading one or
 * two textures and writing one; ./ink-gl decides which pass runs against
 * which texture, and in what order.
 *
 * Every fragment shader shares the same vertex shader and the same prelude,
 * which hands it the current texel and its four neighbours. The neighbours are
 * computed in the vertex stage rather than in each fragment because that is
 * four texel offsets that would otherwise be recomputed a million times a
 * frame for nothing.
 */

export const VERTEX = /* glsl */ `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
uniform vec2 texelSize;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

const PRELUDE = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
`

/** Straight copy, optionally with a floor cut off - the bloom's prefilter. */
export const COPY = PRELUDE + /* glsl */ `
uniform sampler2D uTexture;
uniform float uThreshold;
void main() {
  vec4 c = texture(uTexture, vUv);
  fragColor = vec4(max(c.rgb - uThreshold, 0.0), 1.0);
}
`

/** Multiply a texture by a scalar - how pressure is let go of between frames. */
export const CLEAR = PRELUDE + /* glsl */ `
uniform sampler2D uTexture;
uniform float value;
void main() {
  fragColor = value * texture(uTexture, vUv);
}
`

/**
 * A gaussian blob added to a texture - how ink and force both get in.
 *
 * `point` is in uv, `radius` is squared and measured against the height, and
 * the x offset is stretched by the aspect ratio so the blob is round on a
 * rectangular canvas.
 */
export const SPLAT = PRELUDE + /* glsl */ `
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main() {
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture(uTarget, vUv).xyz;
  fragColor = vec4(base + splat, 1.0);
}
`

/**
 * Semi-Lagrangian advection: each texel looks back along the velocity to
 * where its contents came from and takes a bilinear sample there. Velocity is
 * in texels of the velocity grid per second, so the same pass advects the
 * dye at a different resolution as long as `texelSize` stays the velocity's.
 * `dissipation` is a per-second decay; without it the ink never leaves.
 */
export const ADVECTION = PRELUDE + /* glsl */ `
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
void main() {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
  vec4 result = texture(uSource, coord);
  float decay = 1.0 + dissipation * dt;
  fragColor = result / decay;
}
`

/**
 * Divergence of the velocity, with a closed boundary: a texel on the edge sees
 * its own velocity reflected back at it, so nothing flows through the wall.
 */
export const DIVERGENCE = PRELUDE + /* glsl */ `
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}
`

/** The scalar curl of the velocity - how much each texel is spinning. */
export const CURL = PRELUDE + /* glsl */ `
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  fragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}
`

/**
 * Vorticity confinement: push each texel toward the nearest centre of spin,
 * scaled by how fast that centre is spinning. It is a force, so it is applied
 * over `dt`; `curl` is the one knob and it is most of what decides whether the
 * picture looks like smoke or like soup.
 */
export const VORTICITY = PRELUDE + /* glsl */ `
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main() {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity += force * dt;
  velocity = clamp(velocity, vec2(-1000.0), vec2(1000.0));
  fragColor = vec4(velocity, 0.0, 1.0);
}
`

/** One Jacobi relaxation of the pressure Poisson equation; run many times. */
export const PRESSURE = PRELUDE + /* glsl */ `
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float divergence = texture(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`

/** Subtract the pressure gradient, which is what makes the field divergence-free. */
export const GRADIENT_SUBTRACT = PRELUDE + /* glsl */ `
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  fragColor = vec4(velocity, 0.0, 1.0);
}
`

/** A nine-tap gaussian along one axis; `uDirection` is a texel-sized offset. */
export const BLUR = PRELUDE + /* glsl */ `
uniform sampler2D uTexture;
uniform vec2 uDirection;
void main() {
  vec2 o1 = uDirection * 1.3846;
  vec2 o2 = uDirection * 3.2308;
  vec3 sum = texture(uTexture, vUv).rgb * 0.2270;
  sum += (texture(uTexture, vUv + o1).rgb + texture(uTexture, vUv - o1).rgb) * 0.3162;
  sum += (texture(uTexture, vUv + o2).rgb + texture(uTexture, vUv - o2).rgb) * 0.0702;
  fragColor = vec4(sum, 1.0);
}
`

/**
 * The picture, in two looks blended by `uBlob`.
 *
 * Smoke: the dye is additive and unbounded, and that is used rather than
 * clamped - where it is stacked thick enough it burns through to white, the
 * way a projector does when two clouds overlap. The neutral part of the dye,
 * the amount of it that is white rather than coloured, takes a rainbow from
 * the local curl, so pale ribbons shimmer where they twist and stay white
 * where they lie flat; `uIris` is how much, and the coloured part gets a
 * quarter of the same. Then the glow from the blurred copy, a soft tone
 * curve so nothing clips to a flat block.
 *
 * Blob: the blurred copy is a smooth field, and the field is cut at a
 * threshold. Inside is a flat dark fill with a twinkle of stars in it;
 * along the cut is a bright rim in the ink's own hue plus the curl's
 * rainbow, so two blobs meeting brighten where they merge, like metaballs
 * do. The ground outside is a lifted grey rather than black, which is what
 * makes the dark fill read as a shape and not a hole.
 *
 * Both get the vignette and a grain of dither so the dark reds and blues do
 * not band on an 8-bit panel.
 */
export const DISPLAY = PRELUDE + /* glsl */ `
uniform sampler2D uDye;
uniform sampler2D uGlow;
uniform sampler2D uCurl;
uniform float uIris;
uniform float uGlowGain;
uniform float uBlob;
uniform float uTime;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec3 c = texture(uDye, vUv).rgb;
  vec3 glow = texture(uGlow, vUv).rgb;
  float k = texture(uCurl, vUv).x;
  vec3 rainbow = 0.5 + 0.5 * cos(6.2832 * (k * 0.08 + vec3(0.0, 0.33, 0.67)));

  // Smoke.
  float white = min(min(c.r, c.g), c.b);
  vec3 smoke = c + rainbow * white * uIris + rainbow * (c - white) * uIris * 0.25;
  float thick = max(c.r, dot(c, vec3(0.299, 0.587, 0.114)));
  smoke += vec3(1.0, 0.9, 0.85) * smoothstep(2.4, 6.0, thick);
  smoke += glow * uGlowGain;
  smoke = 1.0 - exp(-smoke * 1.15);

  // Blob.
  float field = dot(glow, vec3(0.333)) * 2.6 + dot(c, vec3(0.333)) * 0.15;
  float cut = 0.5;
  float inside = smoothstep(cut - 0.025, cut + 0.025, field);
  float edge = (field - cut) / 0.06;
  float rim = exp(-edge * edge);
  vec3 hue = normalize(c + glow + vec3(0.02));
  vec3 rimColour = hue * 1.5 + rainbow * 0.55;
  float star = hash(floor(gl_FragCoord.xy / 2.0));
  star = step(0.997, star) * (0.5 + 0.5 * sin(uTime * 2.5 + star * 300.0));
  vec3 blob = vec3(0.10, 0.10, 0.12) * (1.0 - inside * 0.95);
  blob += vec3(0.09, 0.07, 0.34) * inside;
  blob += rimColour * rim * 1.3;
  blob += star * inside * 0.9;

  vec3 col = mix(smoke, blob, uBlob);

  vec2 q = vUv - 0.5;
  col *= 1.0 - dot(q, q) * 0.55;

  float grain = hash(gl_FragCoord.xy);
  col += (grain - 0.5) / 255.0;
  fragColor = vec4(col, 1.0);
}
`
