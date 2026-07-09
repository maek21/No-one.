export const COMMON_WGSL = `
// ── Hash-based pseudo-random ──
fn hash21(p: vec2<f32>) -> f32 {
  var v = p * vec2<f32>(127.1, 311.7);
  return fract(sin(dot(v, vec2<f32>(269.5, 183.3))) * 43758.5453);
}

fn hash13(p: vec3<f32>) -> f32 {
  var v = p * vec3<f32>(127.1, 311.7, 74.7);
  return fract(sin(dot(v, vec3<f32>(269.5, 183.3, 47.3))) * 43758.5453);
}

// ── 2D Value Noise (4 octaves) ──
fn noise2D(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  
  let a = hash21(i + vec2<f32>(0.0, 0.0));
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm2D(p: vec2<f32>) -> f32 {
  var v = 0.0;
  var amp = 0.5;
  var freq = 1.0;
  for (var i = 0u; i < 4u; i = i + 1u) {
    v = v + amp * noise2D(p * freq);
    amp = amp * 0.5;
    freq = freq * 2.0;
  }
  return v;
}

// ── SDF helpers ──
fn sdCircle(p: vec2<f32>, r: f32) -> f32 {
  return length(p) - r;
}

fn opSmoothUnion(d1: f32, d2: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

// ── Metaball field ──
fn metaballField(p: vec2<f32>, centers: array<vec2<f32>, 5>, radius: f32) -> f32 {
  var field = 0.0;
  for (var i = 0u; i < 5u; i = i + 1u) {
    let d = length(p - centers[i]);
    field = field + (radius * radius) / (d * d + 0.001);
  }
  return field;
}

// ── 2D rotation ──
fn rot2D(a: f32) -> mat2x2<f32> {
  let s = sin(a);
  let c = cos(a);
  return mat2x2<f32>(c, s, -s, c);
}
`
