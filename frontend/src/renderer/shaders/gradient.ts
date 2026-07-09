import { COMMON_WGSL } from './helpers'

export const GRADIENT_SHADER = `
${COMMON_WGSL}

// ── Uniforms (std140 layout, 16-byte aligned) ──
struct GradientUniforms {
  time: f32,
  pad0: f32,
  pad1: f32,
  pad2: f32,
  resolution: vec2<f32>,
  pad3: vec2<f32>,
  // 6 palette colors packed as vec3<f32> each (primary, secondary, accent, shadow, highlight, ambient)
  palette: array<vec3<f32>, 6>,
}

@group(0) @binding(0) var<uniform> u: GradientUniforms;

struct VertexOutput {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vs(@builtin(vertex_index) idx: u32) -> VertexOutput {
  let positions = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(1.0, 1.0),
  );
  let pos = positions[idx];
  var out: VertexOutput;
  out.pos = vec4<f32>(pos, 0.0, 1.0);
  out.uv = pos * 0.5 + 0.5;
  return out;
}

// ── Field parameters ──
struct Field {
  index: u32,
  speed: f32,
  scale: f32,
  orbitRadius: f32,
  orbitSpeed: f32,
  phase: f32,
}

fn getField(i: u32) -> Field {
  var f: Field;
  f.index = i;
  if (i == 0u) {
    f.speed = 0.15; f.scale = 1.2; f.orbitRadius = 0.3; f.orbitSpeed = 0.1; f.phase = 0.0;
  } else if (i == 1u) {
    f.speed = 0.2; f.scale = 0.8; f.orbitRadius = 0.25; f.orbitSpeed = 0.14; f.phase = 1.2;
  } else if (i == 2u) {
    f.speed = 0.12; f.scale = 1.0; f.orbitRadius = 0.35; f.orbitSpeed = 0.08; f.phase = 2.5;
  } else if (i == 3u) {
    f.speed = 0.18; f.scale = 0.6; f.orbitRadius = 0.2; f.orbitSpeed = 0.18; f.phase = 3.1;
  } else if (i == 4u) {
    f.speed = 0.1; f.scale = 1.5; f.orbitRadius = 0.4; f.orbitSpeed = 0.06; f.phase = 0.8;
  } else {
    f.speed = 0.22; f.scale = 0.7; f.orbitRadius = 0.15; f.orbitSpeed = 0.2; f.phase = 4.3;
  }
  return f;
}

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4<f32> {
  let uv = in.uv;
  let aspect = u.resolution.x / u.resolution.y;
  var p = uv * 2.0 - 1.0;
  p.x = p.x * aspect;
  
  var color = vec3<f32>(0.0);
  var totalWeight = 0.0;
  
  // Layer: slow ocean-current base (faint ambient)
  let n = fbm2D(p * 1.5 + u.time * 0.02);
  let baseColor = u.palette[5]; // ambient
  color = color + baseColor * (0.08 + n * 0.04);
  totalWeight = 0.12;
  
  // Layer: 6 independent gradient fields
  for (var i = 0u; i < 6u; i = i + 1u) {
    let f = getField(i);
    let t = u.time * f.speed + f.phase;
    
    // Orbiting center
    let orbit = vec2<f32>(
      cos(t * f.orbitSpeed + f.phase) * f.orbitRadius,
      sin(t * f.orbitSpeed * 0.7 + f.phase * 1.3) * f.orbitRadius * 0.8
    );
    let center = vec2<f32>(0.0, 0.0) + orbit;
    
    // Distance to field center
    let d = length(p - center) / f.scale;
    
    // Smooth gaussian field
    let weight = exp(-d * d * 2.0);
    
    color = color + u.palette[i] * weight;
    totalWeight = totalWeight + weight;
  }
  
  // Normalize
  if (totalWeight > 0.0) {
    color = color / totalWeight;
  }
  
  // Subtle dark edge vignette
  let vig = 1.0 - length(uv - 0.5) * 0.3;
  color = color * vig;
  
  return vec4<f32>(color, 0.55);
}
`
