// Unlit painterly materials: soft vertical gradients, watercolour mottling and
// distance mist. No lighting means no faceted, "polygon" shading — surfaces
// read as flat washes of colour, the way a painted world does.
import * as THREE from "three";

import { ATMOSPHERE, type Atmosphere } from "./atmosphere";
export { ATMOSPHERE, type Atmosphere };

export const FOG = { near: 16, far: 78 };

// Watercolour mottling used to be computed per pixel (two 4-octave value
// noises, ~32 sin() calls for every pixel of every surface). It now comes
// from one small tileable texture computed once: same look, a fraction of
// the cost. Red = 4-octave fbm, green = single-octave noise.
const NOISE_SIZE = 256;
const NOISE_CELLS = 32; // lattice cells across the texture at the first octave
let noiseTex: THREE.DataTexture | null = null;
export function noiseTexture() {
  if (noiseTex) return noiseTex;
  const N = NOISE_SIZE;
  const lattice = (period: number, seed: number) => {
    const v = new Float32Array(period * period);
    let x = seed * 9301 + 49297;
    for (let i = 0; i < v.length; i++) { x = (x * 16807) % 2147483647; v[i] = x / 2147483647; }
    return (i: number, j: number) => v[((j % period + period) % period) * period + ((i % period + period) % period)];
  };
  const octave = (period: number, seed: number) => {
    const at = lattice(period, seed);
    const out = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = (x / N) * period, fy = (y / N) * period;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const ux = fx - ix, uy = fy - iy;
      const sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy);
      const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
      out[y * N + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
    return out;
  };
  const o = [octave(NOISE_CELLS, 1), octave(NOISE_CELLS * 2, 2), octave(NOISE_CELLS * 4, 3), octave(NOISE_CELLS * 8, 4)];
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const f = 0.5 * o[0][i] + 0.25 * o[1][i] + 0.125 * o[2][i] + 0.0625 * o[3][i];
    data[i * 4] = Math.round(f * 255);
    data[i * 4 + 1] = Math.round(o[0][i] * 255);
    data[i * 4 + 3] = 255;
  }
  noiseTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.minFilter = THREE.LinearFilter;
  noiseTex.generateMipmaps = false;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

const NOISE = /* glsl */ `
  uniform sampler2D uNoise;
  float fbm(vec2 p) { return texture2D(uNoise, p / ${NOISE_CELLS.toFixed(1)}).r; }
  float noise(vec2 p) { return texture2D(uNoise, p / ${NOISE_CELLS.toFixed(1)}).g; }
`;

const VERT = /* glsl */ `
  varying vec3 vWorld;
  varying float vDepth;
  varying vec3 vNormalW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 mv = viewMatrix * w;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform vec3 uFog;
  uniform vec3 uRim;
  uniform float uY0;
  uniform float uY1;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uGrain;
  uniform float uRimAmount;
  uniform float uOpacity;
  varying vec3 vWorld;
  varying float vDepth;
  varying vec3 vNormalW;
  ${NOISE}
  void main() {
    float t = smoothstep(0.0, 1.0, clamp((vWorld.y - uY0) / (uY1 - uY0), 0.0, 1.0));
    vec3 c = mix(uBottom, uTop, t);
    float n = fbm(vWorld.xz * 0.45 + vWorld.y * 0.3) * 0.65 + fbm(vec2(vWorld.x + vWorld.z, vWorld.y) * 2.1) * 0.35;
    c *= 1.0 + (n - 0.5) * uGrain;
    // Soft light catching edges that face the camera's side, like a painted rim.
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - abs(dot(viewDir, vNormalW)), 2.0);
    c = mix(c, uRim, rim * uRimAmount);
    float f = smoothstep(uFogNear, uFogFar, vDepth);
    c = mix(c, uFog, f);
    gl_FragColor = vec4(c, uOpacity);
    #include <colorspace_fragment>
  }
`;

export interface PaintOptions {
  top: string;
  bottom: string;
  fog: string;
  y0?: number;
  y1?: number;
  grain?: number;
  rim?: string;
  rimAmount?: number;
  opacity?: number;
  side?: THREE.Side;
  fogNear?: number;
  fogFar?: number;
}

// Identical painted surfaces share one material (the same tree, panel or
// arch colour appears dozens of times in a room). Shared materials live for
// the page's lifetime, so dispose() is a no-op for them and revisiting a
// room never rebuilds them.
const paintCache = new Map<string, THREE.ShaderMaterial>();
export function paintMaterial(o: PaintOptions) {
  const key = JSON.stringify(o);
  let m = paintCache.get(key);
  if (!m) {
    m = createPaintMaterial(o);
    m.dispose = () => {};
    paintCache.set(key, m);
  }
  return m;
}

function createPaintMaterial(o: PaintOptions) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: (o.opacity ?? 1) < 1,
    depthWrite: (o.opacity ?? 1) >= 1,
    side: o.side ?? THREE.FrontSide,
    uniforms: {
      uTop: { value: new THREE.Color(o.top) },
      uBottom: { value: new THREE.Color(o.bottom) },
      uFog: { value: new THREE.Color(o.fog) },
      uRim: { value: new THREE.Color(o.rim ?? "#fff8ee") },
      uY0: { value: o.y0 ?? 0 },
      uY1: { value: o.y1 ?? 6 },
      uFogNear: { value: o.fogNear ?? FOG.near },
      uFogFar: { value: o.fogFar ?? FOG.far },
      uGrain: { value: o.grain ?? 0.12 },
      uRimAmount: { value: o.rimAmount ?? 0.35 },
      uOpacity: { value: o.opacity ?? 1 },
      uNoise: { value: noiseTexture() },
    },
  });
}

// --- Sky dome -----------------------------------------------------------------

export function skyMaterial(a: Atmosphere) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: new THREE.Color(a.zenith) },
      uHorizon: { value: new THREE.Color(a.horizon) },
      uGlow: { value: new THREE.Color(a.glow) },
      uTime: { value: 0 },
      uNoise: { value: noiseTexture() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uGlow;
      uniform float uTime;
      varying vec3 vDir;
      ${NOISE}
      void main() {
        float h = vDir.y;
        vec3 c = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
        // A low sun glow toward the far end of every hall.
        float sun = pow(max(dot(normalize(vDir), normalize(vec3(0.15, 0.12, -1.0))), 0.0), 18.0);
        c = mix(c, uGlow, sun * 0.85);
        // Long, soft cloud washes.
        float az = atan(vDir.x, vDir.z);
        float band = fbm(vec2(az * 2.2 + uTime * 0.004, h * 7.0)) ;
        float clouds = smoothstep(0.55, 0.85, band) * smoothstep(0.0, 0.18, h) * (1.0 - smoothstep(0.35, 0.7, h));
        c = mix(c, uGlow, clouds * 0.45);
        c = mix(c, uHorizon, smoothstep(0.08, -0.05, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

// --- Still water ------------------------------------------------------------------

export function waterMaterial(a: Atmosphere) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uWater: { value: new THREE.Color(a.water) },
      uSky: { value: new THREE.Color(a.zenith) },
      uFog: { value: new THREE.Color(a.horizon) },
      uGlow: { value: new THREE.Color(a.glow) },
      uTime: { value: 0 },
      uFogNear: { value: FOG.near },
      uFogFar: { value: FOG.far },
      uNoise: { value: noiseTexture() },
    },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform vec3 uWater;
      uniform vec3 uSky;
      uniform vec3 uFog;
      uniform vec3 uGlow;
      uniform float uTime;
      uniform float uFogNear;
      uniform float uFogFar;
      varying vec3 vWorld;
      varying float vDepth;
      varying vec3 vNormalW;
      ${NOISE}
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(viewDir.y, 0.0), 3.0);
        vec3 c = mix(uWater, uSky, fres * 0.55);
        // Slow horizontal ripples catching the light.
        float r = noise(vec2(vWorld.x * 0.15, vWorld.z * 1.4 + uTime * 0.25));
        c = mix(c, uGlow, smoothstep(0.72, 0.95, r) * 0.35);
        float f = smoothstep(uFogNear, uFogFar, vDepth);
        c = mix(c, uFog, f);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

// --- Glowing portal / halo ------------------------------------------------------------

/** Glow fill for an arch of size w×h whose base sits at y=0. */
export function glowMaterial(color: string, edge: string, opacity = 1, w = 1, h = 1) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uEdge: { value: new THREE.Color(edge) },
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uSize: { value: new THREE.Vector2(w, h) },
      uNoise: { value: noiseTexture() },
    },
    vertexShader: /* glsl */ `
      uniform vec2 uSize;
      varying vec2 vUv;
      void main() {
        vUv = vec2(position.x / uSize.x + 0.5, position.y / uSize.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uEdge;
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;
      ${NOISE}
      void main() {
        vec2 p = vUv - vec2(0.5, 0.42);
        float d = length(p * vec2(1.0, 0.8));
        float shimmer = fbm(vUv * 4.0 + vec2(0.0, uTime * 0.08));
        vec3 c = mix(uColor, uEdge, smoothstep(0.05, 0.6, d + shimmer * 0.15));
        gl_FragColor = vec4(c, uOpacity);
        #include <colorspace_fragment>
      }
    `,
  });
}

export function mix(a: string, b: string, t: number) {
  return "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}
