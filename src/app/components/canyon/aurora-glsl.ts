/**
 * The sky, as a function, so two surfaces can agree on it.
 *
 * The backdrop paints it and the road reflects it, and those are not two
 * effects that happen to look alike - the road is a mirror, so the light on it
 * has to be *the same* aurora, sampled where the reflected ray lands. Two
 * hand-tuned gradients would drift apart the moment either was touched, and the
 * drift shows exactly where you look longest: the vanishing point, where the
 * floor meets the sky.
 *
 * A string rather than a file because there is no glsl loader in this build and
 * adding one for two shaders would be a bundler plugin for a paragraph of text.
 * Both materials prepend it verbatim.
 */
export const AURORA_GLSL = /* glsl */ `
  /** One float out of two, cheap and good enough to be a star or a facet. */
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  /**
   * One float out of three, and the one to reach for when the key is big.
   *
   * hash21 above squares its input and multiplies the halves together, which
   * is fine for a coordinate near the origin and catastrophic for a cell index
   * two hundred metres up a wall: the product overflows what a float can hold
   * apart, and the hash stops being a function of the cell and starts being a
   * function of the pixel. That failure looks exactly like coloured static, and
   * it is why the lit panels on the rock use this one.
   */
  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  /** Value noise, smoothed. Gradient noise would cost more than this look needs. */
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  /**
   * Five octaves, each rotated as well as doubled.
   *
   * The rotation is what keeps the cloud from showing the grid it was built on:
   * without it every octave lines up on the same axes and the nebula reads as
   * plaid at exactly the scale you are looking at.
   */
  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    mat2 turn = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 5; i++) {
      sum += amp * vnoise(p);
      p = turn * p * 2.03;
      amp *= 0.5;
    }
    return sum;
  }

  /**
   * The palette, as five stops rather than a hue wheel.
   *
   * A full spectrum sweep was the first attempt and it is wrong in a way worth
   * recording: hue is linear in *angle*, and the arc from magenta round to blue
   * spends most of its length in yellow and green. The picture this is after
   * spends most of its width in magenta, ember and blue with gold as a seam
   * and green as a sliver, so the ramp has to be authored rather than
   * generated. These five, in this order, are the whole look of the scene -
   * the sky, the light on the rock and the neon on the road all read from here,
   * which is why they are one function and not three constants.
   */
  vec3 auroraTint(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 tint = mix(vec3(1.00, 0.14, 0.70), vec3(1.00, 0.34, 0.09), smoothstep(0.00, 0.30, t));
    tint = mix(tint, vec3(1.00, 0.83, 0.26), smoothstep(0.27, 0.46, t));
    tint = mix(tint, vec3(0.14, 0.95, 0.76), smoothstep(0.46, 0.70, t));
    tint = mix(tint, vec3(0.26, 0.44, 1.00), smoothstep(0.70, 1.00, t));
    return tint;
  }

  /**
   * The whole sky, at a point on the backdrop.
   *
   * 'uv' is in units of AURORA_SCALE world metres, measured from the middle of
   * the fall - not in the backdrop's own uv. That matters: the road reflects
   * this function at points nowhere near the plane's centre, and a coordinate
   * normalised to the plane's size would mean resizing the backdrop silently
   * rescaled the aurora and slid the reflection out from under it. Returns
   * unbounded linear-ish colour: the bright core of the fall goes well past one
   * on purpose, so the reflection below can be scaled down and still glow.
   *
   * Four things stacked, in the order you read them:
   *
   * - **Space.** Near-black indigo, warming toward the horizon haze.
   * - **Stars.** Sparse, and cut by the aurora in front of them.
   * - **The fall.** Curtains, stretched hard in y and warped in x, so the cloud
   *   pours downward instead of drifting sideways. The hue is a function of
   *   *where* rather than of the noise, which is what puts magenta reliably on
   *   the left and cyan on the right however the cloud happens to fall.
   * - **The core.** A narrow near-white column down the middle, because every
   *   version of this picture has one and without it the centre is just where
   *   two colours meet.
   */
  vec3 auroraSky(vec2 uv, float time) {
    // Slow domain warp. Two fbm samples used as an offset, which is what turns
    // banded noise into something with filaments in it.
    vec2 warp = vec2(
      fbm(uv * 3.10 + vec2(0.0, time * 0.045)),
      fbm(uv * 3.10 + vec2(4.30, 1.70 - time * 0.032))
    );

    // Stretched 4:1 in y against x, so every feature is a fall rather than a
    // cloud. The minus on time carries the curtain upward, against the grid
    // scrolling toward you on the floor.
    float curtain = fbm(vec2(uv.x * 6.20 + warp.x * 1.60, uv.y * 1.45 - time * 0.075));
    // The striations inside a curtain: same field, twelve times the frequency
    // across and barely any along.
    float rain = fbm(vec2(uv.x * 46.0 + warp.x * 5.0, uv.y * 1.90 - time * 0.130));

    // Strong overhead, gone by the horizon - the aurora hangs from the top of
    // the frame, and the bottom of the gap is haze.
    float overhead = smoothstep(-0.80, 0.70, uv.y);
    // And concentrated in the corridor's own gap rather than spread over a
    // whole hemisphere.
    float column = exp(-uv.x * uv.x * 0.55);

    float veil = pow(max(curtain - 0.20, 0.0), 1.45) * overhead * (0.55 + 0.75 * rain);
    veil *= 0.45 + 1.35 * column;
    // And a floor under it, so the gaps between the curtains are a glow with
    // stars in it rather than holes. Without this the fall breaks into hard
    // lanes of colour separated by stains of the base colour, which reads as a
    // texture problem rather than as weather.
    veil = veil * 0.82 + 0.20 * overhead * column;
    // And a slow swell across the whole thing, so the fall has bright cores
    // and quiet stretches instead of one even brightness top to bottom.
    veil *= 0.55 + 1.05 * fbm(uv * 0.85 + vec2(1.7, -time * 0.025));

    // Magenta on the left, ember and gold through the middle, teal and blue on
    // the right, with the warp wandering the boundaries so they are not
    // straight and the top running warmer than the bottom.
    // Wandered hard by the warp, not just tinted by position. A ramp read
    // straight off x gives clean vertical bands - a rainbow flag rather than a
    // sky - and the fix is to let the same noise that shapes the cloud also
    // decide which colour a given part of it is. The stops still arrive in
    // order left to right; they just stop arriving in straight lines.
    vec3 tint = auroraTint(
      uv.x * 0.78 + 0.5 + warp.y * 0.46 - 0.23 - uv.y * 0.05 + sin(uv.y * 1.7 - time * 0.05) * 0.06
    );

    // Space, and the lavender haze the road vanishes into.
    vec3 colour = mix(vec3(0.030, 0.018, 0.070), vec3(0.055, 0.030, 0.130), overhead);
    float haze = exp(-pow((uv.y + 0.52) * 2.10, 2.0)) * exp(-uv.x * uv.x * 0.75);
    colour += vec3(0.42, 0.26, 0.86) * haze * 0.62;

    // Stars, on a fine lattice, each a dot inside its own cell rather than the
    // cell itself - a lit square reads as a dead pixel at this density.
    vec2 lattice = uv * 110.0;
    vec2 cell = floor(lattice);
    float spark = hash21(cell);
    float dot2 = length(fract(lattice) - 0.5);
    float star = smoothstep(0.985, 1.0, spark) * smoothstep(0.40, 0.02, dot2);
    colour += vec3(0.80, 0.85, 1.0) * star * (1.0 - overhead * 0.35);

    colour += tint * veil * 3.4;

    // The gold fall down the middle. Narrow, and only where the curtain is
    // already bright, so it belongs to the cloud instead of floating over it.
    float core = exp(-pow((uv.x - 0.02) * 3.4, 2.0)) * overhead * max(curtain - 0.26, 0.0);
    colour += vec3(1.0, 0.93, 0.55) * core * (0.55 + rain) * 1.4;

    return colour;
  }
`
