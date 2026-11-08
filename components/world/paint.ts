// Unlit painterly materials: soft vertical gradients, watercolour mottling and
// distance mist. No lighting means no faceted, "polygon" shading — surfaces
// read as flat washes of colour, the way a painted world does.
import * as THREE from "three";

import { ATMOSPHERE, type Atmosphere } from "./atmosphere";
export { ATMOSPHERE, type Atmosphere };

export const FOG = { near: 16, far: 78 };

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
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

export function paintMaterial(o: PaintOptions) {
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
