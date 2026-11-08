"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { WorldStore } from "@/lib/worldStore";
import { mix, paintMaterial, type Atmosphere } from "./paint";

// The visitor as seen in side view: a small, slender figure in a long dress
// with a flowing cape. Only smooth surfaces; the cape is a soft cloth strip
// whose folds ripple and trail behind as she walks.

const CAPE_W = 10; // columns
const CAPE_H = 14; // rows

function capeGeometry() {
  const g = new THREE.PlaneGeometry(0.42, 0.95, CAPE_W, CAPE_H);
  g.translate(0, -0.475, 0); // hang from the top edge (shoulders)
  return g;
}

export function Figure({ store, atmosphere: a }: { store: WorldStore; atmosphere: Atmosphere }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const cape = useRef<THREE.Mesh>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const trail = useRef(0);

  const dress = useMemo(() => {
    const pts = [
      [0.001, 0], [0.3, 0.0], [0.27, 0.06], [0.2, 0.3], [0.14, 0.55], [0.1, 0.72], [0.115, 0.84], [0.12, 0.9], [0.07, 0.98], [0.04, 1.02], [0.001, 1.03],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    return new THREE.LatheGeometry(pts, 64);
  }, []);
  const capeGeo = useMemo(capeGeometry, []);
  const restPositions = useMemo(() => Float32Array.from(capeGeo.attributes.position.array as Float32Array), [capeGeo]);
  useEffect(() => () => { dress.dispose(); capeGeo.dispose(); }, [dress, capeGeo]);

  const dressMat = useMemo(() => paintMaterial({ top: "#4a3a40", bottom: "#2e2529", fog: a.horizon, y0: 0, y1: 1.1, grain: 0.06, rimAmount: 0.6, rim: a.glow }), [a]);
  const capeMat = useMemo(() => paintMaterial({ top: "#8e3f52", bottom: mix("#8e3f52", "#3a1f28", 0.5), fog: a.horizon, y0: 0.1, y1: 1.1, grain: 0.08, rimAmount: 0.5, rim: a.glow, side: THREE.DoubleSide }), [a]);
  const skinMat = useMemo(() => paintMaterial({ top: "#f6e6da", bottom: "#e9cfc2", fog: a.horizon, y0: 1.0, y1: 1.3, grain: 0.02, rimAmount: 0.3, rim: a.glow }), [a]);
  const hairMat = useMemo(() => paintMaterial({ top: "#3a2e33", bottom: "#2a2226", fog: a.horizon, y0: 1.0, y1: 1.35, grain: 0.04, rimAmount: 0.55, rim: a.glow }), [a]);
  useEffect(() => () => { dressMat.dispose(); capeMat.dispose(); skinMat.dispose(); hairMat.dispose(); }, [dressMat, capeMat, skinMat, hairMat]);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const s = store;
    const g = root.current;
    if (!g) return;
    const show = s.viewBlend > 0.02;
    g.visible = show;
    if (!show) return;
    const speed = Math.hypot(s.vel.x, s.vel.z);
    const sn = Math.min(1, speed / 2);
    g.position.set(s.pos.x, 0, s.pos.z);
    g.rotation.y = s.yaw;
    const t = clock.elapsedTime;
    // Gentle bob and a lean into the walk.
    if (body.current) {
      body.current.position.y = s.reducedMotion ? 0 : Math.abs(Math.sin(s.walkPhase)) * 0.025 * sn;
      body.current.rotation.x = 0.1 * sn;
      body.current.rotation.z = s.reducedMotion ? 0 : Math.sin(s.walkPhase) * 0.02 * sn;
    }
    // Cape: trails further back the faster she moves, rippling along its length.
    trail.current += (sn - trail.current) * (1 - Math.exp(-dt / 0.35));
    const capeMesh = cape.current;
    if (capeMesh) {
      const pos = capeMesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = restPositions[i * 3], y = restPositions[i * 3 + 1];
        const down = -y / 0.95; // 0 at shoulders → 1 at the hem
        const lift = trail.current * down * down * 0.75; // swing backward
        const wave = s.reducedMotion ? 0 : Math.sin(t * (2 + sn * 4) - down * 5 + x * 6) * 0.05 * down * (0.4 + sn);
        const flare = 1 + down * 0.6;
        pos.setXYZ(i, x * flare, y + lift * 0.35, -lift - wave - down * 0.06);
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
        <mesh ref={cape} geometry={capeGeo} material={capeMat} position={[0, 0.95, -0.1]} />
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
