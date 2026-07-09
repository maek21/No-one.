import { COMMON_WGSL } from './helpers'

export const BLOB_SHADER = `
${COMMON_WGSL}

struct BlobUniforms {
  time: f32,
  audioBass: f32,
  audioMid: f32,
  audioTreble: f32,
  resolution: vec2<f32>,
  audioEnergy: f32,
  blobRadius: f32,
  blobIntensity: f32,
  palette: array<vec3<f32>, 6>,
}

@group(0) @binding(0) var<uniform> u: BlobUniforms;

struct VertexOutput {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) worldPos: vec2<f32>,
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
  
  let aspect = u.resolution.x / u.resolution.y;
  var wp = pos;
  wp.x = wp.x * aspect;
  out.worldPos = wp;
  return out;
}

// ── Get metaball center positions (5 balls) ──
fn getCenters(t: f32) -> array<vec2<f32>, 5> {
  var centers: array<vec2<f32>, 5>;
  
  // Central blob
  let breathe = sin(t * 0.3) * 0.08 + 1.0;
  let swayX = sin(t * 0.15) * 0.1;
  let swayY = cos(t * 0.12) * 0.08;
  
  centers[0] = vec2<f32>(swayX, swayY) * breathe;
  
  // Orbiting satellites
  let r1 = 0.35 + sin(t * 0.2) * 0.05;
  let r2 = 0.5 + cos(t * 0.25) * 0.04;
  let r3 = 0.42 + sin(t * 0.18 + 1.0) * 0.06;
  let r4 = 0.55 + cos(t * 0.22 + 2.0) * 0.05;
  
  centers[1] = vec2<f32>(cos(t * 0.4) * r1, sin(t * 0.38) * r1 * 0.7);
  centers[2] = vec2<f32>(cos(t * 0.3 + 1.5) * r2, sin(t * 0.32 + 1.5) * r2 * 0.8);
  centers[3] = vec2<f32>(cos(t * 0.5 + 3.0) * r3 * 0.6, sin(t * 0.45 + 3.0) * r3);
  centers[4] = vec2<f32>(cos(t * 0.35 + 4.5) * r4 * 0.7, sin(t * 0.28 + 4.5) * r4 * 0.7);
  
  return centers;
}

// ── Compute blob SDF field value ──
fn blobField(p: vec2<f32>, centers: array<vec2<f32>, 5>, radius: f32, t: f32) -> f32 {
  var field = 0.0;
  
  // Noise deformation
  let noiseScale = 0.6;
  let n = fbm2D(p * noiseScale + t * 0.05) * 0.3;
  
  for (var i = 0u; i < 5u; i = i + 1u) {
    let c = centers[i];
    // Apply noise displacement to center
    let noiseOffset = vec2<f32>(
      fbm2D(c + t * 0.03 + vec2<f32>(10.0, 0.0)) * 0.2,
      fbm2D(c + t * 0.03 + vec2<f32>(0.0, 10.0)) * 0.2
    );
    let displaced = p - (c + noiseOffset);
    let d = length(displaced);
    field = field + (radius * radius) / (d * d + 0.001);
  }
  
  return field;
}

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4<f32> {
  let aspect = u.resolution.x / u.resolution.y;
  var p = in.worldPos;
  
  let t = u.time;
  let bass = u.audioBass;
  let energy = u.audioEnergy;
  
  // Dynamic radius influenced by audio
  let baseRadius = u.blobRadius;
  let audioPulse = baseRadius * (1.0 + bass * 0.15);
  let pulse = audioPulse * (1.0 + sin(t * 2.0) * 0.02);
  
  // Get metaball centers
  let centers = getCenters(t);
  
  // Compute field
  let field = blobField(p, centers, pulse, t);
  let threshold = 1.6;
  
  // Surface distance (0 = at surface, positive = outside, negative = inside)
  let surfaceDist = threshold - field;
  
  // Edge width for Fresnel / chromatic aberration
  let edgeWidth = 0.3 + bass * 0.2;
  
  // Gaussian blur for smooth edge
  let edgeFade = smoothstep(-edgeWidth, edgeWidth, surfaceDist);
  
  // ── Fresnel effect ──
  // Compute normal using finite differences
  let eps = 0.01;
  let c = centers[0];
  let fieldX = blobField(p + vec2<f32>(eps, 0.0), centers, pulse, t);
  let fieldY = blobField(p + vec2<f32>(0.0, eps), centers, pulse, t);
  let grad = vec2<f32>(fieldX - field, fieldY - field);
  let gradLen = length(grad);
  let normal = normalize(grad);
  
  // View direction (from center, pointing outward)
  let viewDir = normalize(p.xy);
  let fresnel = pow(1.0 - abs(dot(normal, viewDir)), 2.5);
  
  // ── Chromatic aberration ──
  // Offset UV based on edge distance for RGB separation
  let edgeDist = abs(surfaceDist);
  let caAmount = smoothstep(0.0, 0.5, 1.0 - edgeDist) * 0.008;
  let caDir = normalize(grad) * caAmount;
  
  // ── Internal reflection ──
  let internalNoise = fbm2D(p * 2.0 + t * 0.02) * 0.5 + 0.5;
  let reflection = sin(p.x * 3.0 + p.y * 2.0 + t * 0.5) * 0.5 + 0.5;
  let internalReflection = internalNoise * reflection * 0.15 * (1.0 - edgeFade);
  
  // ── Surface noise ──
  let surfaceNoise = fbm2D(p * 4.0 + t * 0.01) * 0.03;
  
  // ── Compose color ──
  
  // Inside blob: use primary palette color with depth
  let depth = 1.0 - edgeFade;
  let insideColor = mix(u.palette[0], u.palette[1], depth * 0.3); // primary → secondary
  
  // Fresnel edge glow (white-ish, tinted by accent)
  let fresnelColor = mix(u.palette[2], vec3<f32>(1.0, 1.0, 1.0), fresnel * 0.5);
  
  // Chromatic edges (subtle RGB separation)
  let rOffset = blobField(p + caDir, centers, pulse, t);
  let bOffset = blobField(p - caDir, centers, pulse, t);
  let rEdge = smoothstep(-edgeWidth, edgeWidth, threshold - rOffset);
  let bEdge = smoothstep(-edgeWidth, edgeWidth, threshold - bOffset);
  let chromaticR = rEdge * (1.0 - edgeFade) * 0.04;
  let chromaticB = bEdge * (1.0 - edgeFade) * 0.04;
  
  // Final blob color
  var blobColor = insideColor;
  
  // Add Fresnel to edges
  let fresnelIntensity = fresnel * (0.3 + energy * 0.2);
  blobColor = blobColor + fresnelColor * fresnelIntensity;
  
  // Add chromatic separation
  blobColor.r = blobColor.r + chromaticR;
  blobColor.b = blobColor.b + chromaticB;
  
  // Add internal reflection
  blobColor = blobColor + vec3<f32>(0.6, 0.65, 0.8) * internalReflection * (1.0 - edgeFade);
  
  // Add surface noise
  blobColor = blobColor + surfaceNoise;
  
  // Subtle glow outside the blob
  let glowAmount = exp(-max(surfaceDist, 0.0) * 4.0) * 0.08 * (1.0 + bass * 0.3);
  let glowColor = u.palette[0] * glowAmount;
  
  // Alpha: opaque inside, fading at edges
  let alpha = clamp(edgeFade + fresnel * 0.3 + glowAmount * 2.0, 0.0, 1.0);
  
  // Rim light (top highlight)
  let rimY = p.y + 0.5;
  let rim = smoothstep(0.0, 0.4, rimY) * smoothstep(1.0, 0.2, rimY) * 0.1;
  blobColor = blobColor + vec3<f32>(1.0, 0.95, 0.9) * rim * (1.0 - edgeFade) * 0.5;
  
  let finalColor = blobColor + glowColor;
  
  return vec4<f32>(finalColor, alpha);
}
`
