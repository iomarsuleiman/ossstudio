"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ExhibitPlacement, Motif } from "@/content";
import { INSTALLATION_MOTIFS } from "@/content/layout";
import { useRoomActive } from "./roomActive";

// Small sculptural companions for selected Opening Collection pieces.
// Each sits on the floor in front of its painting (or on the plinth for
// pedestal pieces) and moves slowly. Motion is skipped with reduced motion.

const ANIMATED: Partial<Record<Motif, true>> = Object.fromEntries(INSTALLATION_MOTIFS.map((m) => [m, true]));

export const INSTALLATION_OFFSET = 1.05;

export function hasInstallation(motif?: Motif) {
  return !!motif && !!ANIMATED[motif];
}

function Plinth({ color, r = 0.42, h = 0.22 }: { color: string; r?: number; h?: number }) {
  return (
    <mesh position={[0, h / 2, 0]}>
      <cylinderGeometry args={[r, r * 1.08, h, 28]} />
      <meshLambertMaterial color={color} />
    </mesh>
  );
}

export function Installation({ exhibit, motif, accent, trim }: { exhibit: ExhibitPlacement; motif: Motif; accent: string; trim: string }) {
  if (!ANIMATED[motif]) return null;
  const pedestal = exhibit.kind === "pedestal";
  const floorY = -exhibit.y;
  return (
    <group position={[exhibit.x, exhibit.y, exhibit.z]} rotation={[0, exhibit.rotY, 0]}>
      <group position={pedestal ? [0, -0.25, 0.35] : [0, floorY, INSTALLATION_OFFSET]}>
        {!pedestal && <Plinth color={trim} />}
        <group position={[0, pedestal ? 0 : 0.22, 0]}>
          <Piece motif={motif} accent={accent} trim={trim} />
        </group>
      </group>
    </group>
  );
}

function Piece({ motif, accent, trim }: { motif: Motif; accent: string; trim: string }) {
  const ref = useRef<THREE.Group>(null);
  const parts = useRef<(THREE.Object3D | null)[]>([]);
  const reduced = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }), [accent]);

  const active = useRoomActive();
  useFrame(({ clock }) => {
    if (!active) return; // a hidden, recently visited room
    if (reduced) return;
    const t = clock.elapsedTime;
    const g = ref.current;
    if (!g) return;
    switch (motif) {
      case "sculpture":
      case "chip":
        g.rotation.y = t * 0.35;
        break;
      case "chess": {
        const line = parts.current[0];
        if (line) line.position.x = Math.sin(t * 0.6) * 0.18;
        break;
      }
      case "voice":
        parts.current.forEach((p, i) => {
          if (!p) return;
          const k = (t * 0.25 + i / 5) % 1;
          p.position.set(Math.sin(i * 2 + t) * 0.12, 0.45 + k * 0.6, 0);
          p.scale.setScalar(1 - k * 0.6);
        });
        break;
      case "send": {
        const orb = parts.current[0];
        if (orb) {
          const k = (Math.sin(t * 0.7) + 1) / 2;
          orb.position.set(-0.3 + k * 0.6, 0.35 + Math.sin(k * Math.PI) * 0.3, 0);
        }
        break;
      }
      case "wave":
        parts.current.forEach((p, i) => {
          if (p) p.scale.y = 0.3 + Math.abs(Math.sin(t * 1.2 + i * 0.7)) * 0.9;
        });
        break;
      case "reel":
        parts.current.forEach((p, i) => { if (p) p.rotation.z = t * (i ? -0.8 : 0.6); });
        break;
      case "containers":
        parts.current.forEach((p, i) => { if (p) p.position.y = 0.09 + Math.floor(i / 2) * 0.17 + Math.max(0, Math.sin(t * 0.8 - i)) * 0.03; });
        break;
      case "constellation":
        g.rotation.y = t * 0.15;
        break;
      case "branches":
        g.scale.setScalar(1 + Math.sin(t * 0.5) * 0.03);
        break;
      case "vault":
        if (parts.current[0]) parts.current[0].rotation.z = -t * 0.4;
        break;
      case "circuit":
        parts.current.forEach((p, i) => {
          const m = (p as THREE.Mesh | null)?.material as THREE.MeshBasicMaterial | undefined;
          if (m) m.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(t * 1.5 - i * 0.6));
        });
        break;
    }
  });

  const set = (i: number) => (o: THREE.Object3D | null) => { parts.current[i] = o; };

  switch (motif) {
    case "chess":
      return (
        <group ref={ref}>
          {Array.from({ length: 16 }, (_, i) => (
            <mesh key={i} position={[((i % 4) - 1.5) * 0.12, 0.31, (Math.floor(i / 4) - 1.5) * 0.12]}>
              <boxGeometry args={[0.12, 0.02, 0.12]} />
              <meshLambertMaterial color={(i + Math.floor(i / 4)) % 2 ? "#5e2836" : "#f4ead9"} />
            </mesh>
          ))}
          <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.05, 0.08, 0.3, 12]} /><meshLambertMaterial color={trim} /></mesh>
          <mesh ref={set(0)} position={[0, 0.5, 0]}><boxGeometry args={[0.02, 0.32, 0.02]} /><primitive object={glowMat} attach="material" /></mesh>
          <mesh position={[0.12, 0.42, 0.06]}><coneGeometry args={[0.04, 0.16, 10]} /><meshLambertMaterial color="#3d3737" /></mesh>
        </group>
      );
    case "sculpture":
      return (
        <group ref={ref} position={[0, 0.42, 0]}>
          <mesh><torusKnotGeometry args={[0.17, 0.055, 120, 12, 2, 3]} /><meshLambertMaterial color={accent} flatShading /></mesh>
        </group>
      );
    case "voice":
      return (
        <group ref={ref}>
          <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.02, 0.03, 0.4, 8]} /><meshLambertMaterial color="#3d3737" /></mesh>
          <mesh position={[0, 0.45, 0]}><capsuleGeometry args={[0.06, 0.1, 6, 12]} /><meshLambertMaterial color="#3d3737" /></mesh>
          {Array.from({ length: 5 }, (_, i) => (
            <mesh key={i} ref={set(i)} position={[0, 0.5 + i * 0.1, 0]}>
              <boxGeometry args={[0.07, 0.09, 0.01]} />
              <meshBasicMaterial color={i % 2 ? accent : "#f4ead9"} toneMapped={false} />
            </mesh>
          ))}
        </group>
      );
    case "send":
      return (
        <group ref={ref}>
          <mesh position={[-0.32, 0.14, 0]}><boxGeometry args={[0.18, 0.28, 0.03]} /><meshLambertMaterial color="#3d3737" /></mesh>
          <mesh position={[0.32, 0.1, 0]} rotation={[-0.4, 0, 0]}><boxGeometry args={[0.24, 0.16, 0.02]} /><meshLambertMaterial color="#3d3737" /></mesh>
          <mesh ref={set(0)}><sphereGeometry args={[0.05, 16, 16]} /><primitive object={glowMat} attach="material" /></mesh>
        </group>
      );
    case "wave":
      return (
        <group ref={ref}>
          {Array.from({ length: 9 }, (_, i) => (
            <mesh key={i} ref={set(i)} position={[(i - 4) * 0.08, 0.25, 0]}>
              <boxGeometry args={[0.05, 0.5, 0.05]} />
              <meshLambertMaterial color={i % 2 ? accent : trim} />
            </mesh>
          ))}
        </group>
      );
    case "reel":
      return (
        <group ref={ref}>
          {[[-0.16, 0.42, 0.17], [0.18, 0.36, 0.12]].map(([x, y, r], i) => (
            <mesh key={i} ref={set(i)} position={[x, y, 0]}>
              <cylinderGeometry args={[r, r, 0.04, 6]} />
              <meshLambertMaterial color={i ? accent : "#3d3737"} flatShading />
            </mesh>
          ))}
          <mesh position={[0, 0.12, 0]}><boxGeometry args={[0.5, 0.24, 0.16]} /><meshLambertMaterial color={trim} /></mesh>
        </group>
      );
    case "containers":
      return (
        <group ref={ref}>
          {Array.from({ length: 5 }, (_, i) => (
            <mesh key={i} ref={set(i)} position={[((i % 2) - 0.5) * 0.3 + (i === 4 ? 0.15 : 0), 0.09 + Math.floor(i / 2) * 0.17, 0]}>
              <boxGeometry args={[0.28, 0.15, 0.16]} />
              <meshLambertMaterial color={["#86394a", "#9aa985", "#c99a5b", "#7d708f", accent][i]} />
            </mesh>
          ))}
        </group>
      );
    case "constellation":
      return (
        <group ref={ref} position={[0, 0.45, 0]}>
          {Array.from({ length: 7 }, (_, i) => {
            const a = (i / 7) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.32, Math.sin(i * 1.7) * 0.15, Math.sin(a) * 0.32]} rotation={[0, -a, 0]}>
                <planeGeometry args={[0.14, 0.11]} />
                <meshBasicMaterial color={["#f4ead9", accent, "#c99a5b", "#9aa985"][i % 4]} side={THREE.DoubleSide} toneMapped={false} />
              </mesh>
            );
          })}
          <mesh><sphereGeometry args={[0.04, 12, 12]} /><primitive object={glowMat} attach="material" /></mesh>
        </group>
      );
    case "branches":
      return (
        <group ref={ref}>
          <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.025, 0.035, 0.5, 8]} /><meshLambertMaterial color="#3d3737" /></mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.1, 0.42, 0]} rotation={[0, 0, -s * 0.7]}><cylinderGeometry args={[0.015, 0.02, 0.3, 8]} /><meshLambertMaterial color="#3d3737" /></mesh>
          ))}
          {[[-0.2, 0.55], [0.2, 0.55], [0, 0.55]].map(([x, y], i) => (
            <mesh key={i} position={[x, y, 0]}><sphereGeometry args={[0.04, 12, 12]} /><meshBasicMaterial color={i === 2 ? accent : "#f4ead9"} toneMapped={false} /></mesh>
          ))}
        </group>
      );
    case "vault":
      return (
        <group ref={ref}>
          <mesh position={[0, 0.2, 0]}><boxGeometry args={[0.4, 0.4, 0.3]} /><meshLambertMaterial color={trim} /></mesh>
          <mesh ref={set(0)} position={[0, 0.2, 0.16]}><torusGeometry args={[0.1, 0.018, 8, 24, Math.PI * 1.6]} /><primitive object={glowMat} attach="material" /></mesh>
        </group>
      );
    case "circuit":
      return (
        <group ref={ref}>
          <mesh position={[0, 0.04, 0]}><boxGeometry args={[0.7, 0.05, 0.5]} /><meshLambertMaterial color="#5d7c78" /></mesh>
          <mesh position={[0, 0.1, 0]}><boxGeometry args={[0.18, 0.06, 0.14]} /><meshLambertMaterial color="#3d3737" /></mesh>
          {Array.from({ length: 6 }, (_, i) => (
            <mesh key={i} ref={set(i)} position={[-0.27 + i * 0.11, 0.09, 0.18]}>
              <sphereGeometry args={[0.025, 10, 10]} />
              <meshBasicMaterial color={i % 2 ? accent : "#c99a5b"} transparent toneMapped={false} />
            </mesh>
          ))}
        </group>
      );
    case "chip":
      return (
        <group ref={ref} position={[0, 0.2, 0]}>
          {Array.from({ length: 9 }, (_, i) => (
            <mesh key={i} position={[((i % 3) - 1) * 0.15, Math.floor(i / 3) * 0.12, 0]}>
              <boxGeometry args={[0.13, 0.1, 0.13]} />
              <meshLambertMaterial color={i % 2 ? accent : "#7d708f"} />
            </mesh>
          ))}
        </group>
      );
    default:
      return null;
  }
}
