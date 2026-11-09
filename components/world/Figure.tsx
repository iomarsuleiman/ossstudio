"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { WorldStore } from "@/lib/worldStore";
import { mix, paintMaterial, type Atmosphere } from "./paint";

// The visitor as seen in third person: a small, slender figure in a long dress
// with a flowing cape. Only smooth surfaces; the cape is a soft cloth strip
// whose folds ripple and trail behind as she walks.

const CAPE_LEN = 0.86;

/** A curved, tapered cloth wrapping the back and shoulders, flaring to the hem. */
function capeGeometry() {
  // An open cone segment around the back (-z): narrow at the shoulders, wide at the hem.
  const g = new THREE.CylinderGeometry(0.11, 0.27, CAPE_LEN, 28, 16, true, Math.PI - 1.45, 2.9);
  g.translate(0, -CAPE_LEN / 2, 0); // hang from the shoulders
  return g;
}

// --- Shared resources --------------------------------------------------------------
// Kept for the page's lifetime: a few small geometries and one material set
// per room atmosphere (and per cape colour), reused by every figure.
const dressCache = new Map<boolean, THREE.LatheGeometry>();
function sharedDress(detail: boolean) {
  let g = dressCache.get(detail);
  if (!g) {
    const pts = [
      [0.001, 0], [0.3, 0.0], [0.27, 0.06], [0.2, 0.3], [0.14, 0.55], [0.1, 0.72], [0.115, 0.84], [0.12, 0.9], [0.07, 0.98], [0.04, 1.02], [0.001, 1.03],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    g = new THREE.LatheGeometry(pts, detail ? 64 : 24);
    dressCache.set(detail, g);
  }
  return g;
}
let stillCape: THREE.BufferGeometry | null = null;
function sharedStillCape() { return (stillCape ??= capeGeometry()); }

const materialCache = new WeakMap<Atmosphere, { dressMat: THREE.Material; skinMat: THREE.Material; hairMat: THREE.Material; capes: Map<string, THREE.Material> }>();
function materialsFor(a: Atmosphere) {
  let m = materialCache.get(a);
  if (!m) {
    m = {
      dressMat: paintMaterial({ top: "#4a3a40", bottom: "#2e2529", fog: a.horizon, y0: 0, y1: 1.1, grain: 0.06, rimAmount: 0.6, rim: a.glow }),
      skinMat: paintMaterial({ top: "#f6e6da", bottom: "#e9cfc2", fog: a.horizon, y0: 1.0, y1: 1.3, grain: 0.02, rimAmount: 0.3, rim: a.glow }),
      hairMat: paintMaterial({ top: "#3a2e33", bottom: "#2a2226", fog: a.horizon, y0: 1.0, y1: 1.35, grain: 0.04, rimAmount: 0.55, rim: a.glow }),
      capes: new Map(),
    };
    materialCache.set(a, m);
  }
  return m;
}
function sharedMaterials(a: Atmosphere) { return materialsFor(a); }
function sharedCape(a: Atmosphere, color: string) {
  const m = materialsFor(a);
  let c = m.capes.get(color);
  if (!c) {
    c = paintMaterial({ top: color, bottom: mix(color, "#3a1f28", 0.5), fog: a.horizon, y0: 0.1, y1: 1.1, grain: 0.08, rimAmount: 0.5, rim: a.glow, side: THREE.DoubleSide });
    m.capes.set(color, c);
  }
  return c;
}

export interface FigurePose {
  visible: boolean;
  x: number;
  z: number;
  yaw: number;
  /** m/s */
  speed: number;
  walkPhase: number;
  /** 0 standing → 1 seated */
  sit: number;
  reduced: boolean;
}

/** Your own figure, seen in third person. */
export function Figure({ store, atmosphere }: { store: WorldStore; atmosphere: Atmosphere }) {
  const pose = useRef<FigurePose>({ visible: false, x: 0, z: 0, yaw: 0, speed: 0, walkPhase: 0, sit: 0, reduced: false });
  const read = () => {
    const s = store, p = pose.current;
    p.visible = s.viewBlend > 0.02;
    p.x = s.pos.x; p.z = s.pos.z; p.yaw = s.bodyYaw;
    p.speed = Math.hypot(s.vel.x, s.vel.z);
    p.walkPhase = s.walkPhase; p.sit = s.sitBlend; p.reduced = s.reducedMotion;
    return p;
  };
  return <FigureBody read={read} atmosphere={atmosphere} cape="#8e3f52" />;
}

/**
 * The figure itself. `read` is called every frame for its pose; `cape` tints
 * it (each visitor has their own colour). `detail` = false skips the cloth
 * simulation for figures far away.
 */
export function FigureBody({ read, atmosphere: a, cape: capeColor, detail = true }: { read: () => FigurePose; atmosphere: Atmosphere; cape: string; detail?: boolean }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const cape = useRef<THREE.Mesh>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const trail = useRef(0);

  // Geometry and materials are shared between figures of the same look, so a
  // room full of visitors costs a handful of materials, not four per person.
  // Only a figure with an animated cape needs its own cape geometry.
  const dress = useMemo(() => sharedDress(detail), [detail]);
  const capeGeo = useMemo(() => (detail ? capeGeometry() : sharedStillCape()), [detail]);
  const restPositions = useMemo(() => Float32Array.from(capeGeo.attributes.position.array as Float32Array), [capeGeo]);
  useEffect(() => () => { if (detail) capeGeo.dispose(); }, [capeGeo, detail]);
  const { dressMat, skinMat, hairMat } = useMemo(() => sharedMaterials(a), [a]);
  const capeMat = useMemo(() => sharedCape(a, capeColor), [a, capeColor]);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const s = read();
    const g = root.current;
    if (!g) return;
    g.visible = s.visible;
    if (!s.visible) return;
    const sn = Math.min(1, s.speed / 2);
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.yaw;
    const t = clock.elapsedTime;
    const sit = s.sit * s.sit * (3 - 2 * s.sit);
    if (body.current) {
      // Seated: the skirt folds onto the bench (shorter and raised) and the
      // figure leans back a touch; standing: a gentle bob and a lean into the walk.
      body.current.position.y = (s.reduced ? 0 : Math.abs(Math.sin(s.walkPhase)) * 0.025 * sn) + sit * 0.16;
      body.current.scale.set(1.12, 1.12 * (1 - sit * 0.3), 1.12);
      body.current.rotation.x = 0.1 * sn - sit * 0.06;
      body.current.rotation.z = s.reduced ? 0 : Math.sin(s.walkPhase) * 0.02 * sn;
    }
    // Cape: trails further back the faster she moves, rippling along its length.
    trail.current += (sn - trail.current) * (1 - Math.exp(-dt / 0.35));
    const capeMesh = cape.current;
    if (capeMesh && detail) {
      const pos = capeMesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = restPositions[i * 3], y = restPositions[i * 3 + 1], z = restPositions[i * 3 + 2];
        const down = -y / CAPE_LEN; // 0 at shoulders → 1 at the hem
        const lift = trail.current * down * down * 0.55; // swings back as she walks
        const wave = s.reduced ? 0 : Math.sin(t * (1.6 + sn * 4) - down * 5 + x * 7) * 0.035 * down * (0.5 + sn);
        pos.setXYZ(i, x, y + lift * 0.3, z - lift - wave);
      }
      pos.needsUpdate = true;
      capeMesh.geometry.computeVertexNormals();
    }
    if (shadow.current) shadow.current.scale.setScalar(1 - sn * 0.08);
  });

  return (
    <group ref={root} visible={false}>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} raycast={() => null}>
        <circleGeometry args={[0.38, 32]} />
        <meshBasicMaterial color="#3a2a2e" transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <group ref={body} scale={1.12}>
        <mesh geometry={dress} material={dressMat} />
        <mesh ref={cape} geometry={capeGeo} material={capeMat} position={[0, 0.94, -0.015]} />
        <mesh material={skinMat} position={[0, 1.13, 0]}>
          <sphereGeometry args={[0.1, 32, 24]} />
        </mesh>
        {/* Hair: a rounded cap with a long soft fall down the back. */}
        <mesh material={hairMat} position={[0, 1.155, -0.012]} scale={[1.07, 1.02, 1.1]}>
          <sphereGeometry args={[0.1, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        </mesh>
        <mesh material={hairMat} position={[0, 1.04, -0.08]} rotation={[0.25, 0, 0]} scale={[0.85, 1.6, 0.55]}>
          <sphereGeometry args={[0.08, 24, 16]} />
        </mesh>
      </group>
    </group>
  );
}
