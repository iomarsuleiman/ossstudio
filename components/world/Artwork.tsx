"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ExhibitPlacement, GalleryContent, Project } from "@/content";
import { artworkUrl, roomFor } from "@/lib/artworks";
import { paintPlaque } from "@/lib/painter";
import type { WorldStore } from "@/lib/worldStore";

const loader = new THREE.TextureLoader();

// Soft radial glow shared by every artwork (white, tinted per material).
let glowTexture: THREE.Texture | null = null;
function getGlow() {
  if (glowTexture) return glowTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.55, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

export function Artwork({
  exhibit, project, content, store, onClick,
}: {
  exhibit: ExhibitPlacement;
  project: Project;
  content: GalleryContent;
  store: WorldStore;
  onClick: () => void;
}) {
  const home = roomFor(content, project);
  const room = content.rooms.find((r) => r.id === exhibit.roomId)!;
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  const group = useRef<THREE.Group>(null);
  const glow = useRef(0);

  useEffect(() => {
    let alive = true;
    let loaded: THREE.Texture | null = null;
    artworkUrl(project, home).then((url) => {
      if (!alive) return;
      loader.load(url, (t) => {
        if (!alive) return t.dispose();
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        loaded = t;
        setTex(t);
      });
    });
    return () => {
      alive = false;
      loaded?.dispose();
    };
  }, [project, home]);

  const plaque = useMemo(() => {
    const t = new THREE.CanvasTexture(paintPlaque(project.title, room.palette));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [project.title, room.palette]);
  useEffect(() => () => plaque.dispose(), [plaque]);

  useFrame((_, dt) => {
    const near = store.nearby?.id === exhibit.id ? 1 : 0;
    glow.current += (near - glow.current) * (1 - Math.exp(-dt / 0.25));
    if (halo.current) halo.current.opacity = glow.current * 0.55;
    if (group.current) {
      const s = 1 + glow.current * 0.025;
      group.current.scale.setScalar(s);
    }
  });

  const { w, h } = exhibit;
  const fw = 0.1; // frame width
  const pedestal = exhibit.kind === "pedestal";
  const frameColor = project.openingOrder ? "#8a6a3f" : room.palette.trim;

  return (
    <group position={[exhibit.x, exhibit.y, exhibit.z]} rotation={[0, exhibit.rotY, 0]}>
      <group
        ref={group}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = ""; }}
      >
        {pedestal && (
          <mesh position={[0, -exhibit.y / 2 - 0.1, 0.35]} rotation={[0, 0, 0]}>
            <boxGeometry args={[0.9, exhibit.y - 0.3, 0.9]} />
            <meshLambertMaterial color={room.palette.wall} />
          </mesh>
        )}
        {pedestal ? (
          // Invisible hit area around the sculpture that sits on the plinth.
          <mesh position={[0, 0.2, 0.35]} visible={false}>
            <boxGeometry args={[1.0, 1.2, 1.0]} />
          </mesh>
        ) : (
          <mesh position={[0, 0, 0.04]}>
            <planeGeometry args={[w, h]} />
            {/* Distinct keys force a fresh material (and shader) once the map arrives. */}
            {tex ? (
              <meshBasicMaterial key="art" map={tex} toneMapped={false} />
            ) : (
              <meshBasicMaterial key="blank" color={room.palette.fog} toneMapped={false} />
            )}
          </mesh>
        )}
        {!pedestal && (
          <>
            <mesh position={[0, 0, -0.005]}>
              <planeGeometry args={[w * 1.9, h * 1.9]} />
              <meshBasicMaterial ref={halo} map={getGlow()} color="#fff4dc" transparent opacity={0} depthWrite={false} toneMapped={false} />
            </mesh>
            {/* Frame */}
            <mesh position={[0, h / 2 + fw / 2, 0.05]}><boxGeometry args={[w + fw * 2, fw, 0.1]} /><meshLambertMaterial color={frameColor} /></mesh>
            <mesh position={[0, -h / 2 - fw / 2, 0.05]}><boxGeometry args={[w + fw * 2, fw, 0.1]} /><meshLambertMaterial color={frameColor} /></mesh>
            <mesh position={[-w / 2 - fw / 2, 0, 0.05]}><boxGeometry args={[fw, h, 0.1]} /><meshLambertMaterial color={frameColor} /></mesh>
            <mesh position={[w / 2 + fw / 2, 0, 0.05]}><boxGeometry args={[fw, h, 0.1]} /><meshLambertMaterial color={frameColor} /></mesh>
          </>
        )}
        <mesh position={[0, pedestal ? -0.35 : -h / 2 - 0.36, pedestal ? 0.82 : 0.03]}>
          <planeGeometry args={[pedestal ? 0.8 : 0.9, pedestal ? 0.15 : 0.17]} />
          <meshBasicMaterial map={plaque} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
