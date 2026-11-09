"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ExhibitPlacement, GalleryContent, Project } from "@/content";
import { artworkUrl, roomFor } from "@/lib/artworks";
import { paintPlaque } from "@/lib/painter";
import type { WorldStore } from "@/lib/worldStore";
import { mix, paintMaterial, type Atmosphere } from "./paint";
import { frameGeometry, steleGeometry } from "./shapes";

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
  exhibit, project, content, store, atmosphere, onClick,
}: {
  exhibit: ExhibitPlacement;
  project: Project;
  content: GalleryContent;
  store: WorldStore;
  atmosphere: Atmosphere;
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
    // Counted so a teleport can lift its veil as soon as the room is fully painted.
    let pending = true;
    store.texturesPending++;
    const done = () => { if (pending) { pending = false; store.texturesPending--; } };
    artworkUrl(project, home).then((url) => {
      if (!alive) return;
      loader.load(url, (t) => {
        if (!alive) return t.dispose();
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        loaded = t;
        setTex(t);
        done();
      }, undefined, done);
    }, done);
    return () => {
      alive = false;
      done();
      loaded?.dispose();
    };
  }, [project, home, store]);

  const plaque = useMemo(() => {
    const t = new THREE.CanvasTexture(paintPlaque(project.title, room.palette));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [project.title, room.palette]);
  useEffect(() => () => plaque.dispose(), [plaque]);

  useFrame((_, dt) => {
    const near = store.nearby?.id === exhibit.id ? 1 : 0;
    glow.current += (near - glow.current) * (1 - Math.exp(-dt / 0.25));
    if (halo.current) halo.current.opacity = glow.current * 0.7;
    if (group.current) {
      const s = 1 + glow.current * 0.025;
      group.current.scale.setScalar(s);
    }
  });

  const { w, h } = exhibit;
  const pedestal = exhibit.kind === "pedestal";
  const a = atmosphere;
  const frameColor = project.openingOrder ? "#b08a4e" : mix(a.monument, "#3d3030", 0.15);
  const steleH = exhibit.y + h / 2 + 0.85;
  const steleW = w + 1.0;

  const steleGeo = useMemo(() => (pedestal ? null : steleGeometry(steleW, steleH)), [pedestal, steleW, steleH]);
  const frameGeo = useMemo(() => (pedestal ? null : frameGeometry(w, h, 0.09)), [pedestal, w, h]);
  const plinthGeo = useMemo(() => (pedestal ? new THREE.LatheGeometry(
    [[0, 0], [0.62, 0], [0.6, 0.06], [0.42, 0.2], [0.34, 0.55], [0.4, 0.88], [0.55, 0.96], [0.55, 1.0], [0, 1.0]].map(([r, y]) => new THREE.Vector2(r, y)), 64,
  ) : null), [pedestal]);
  const steleMat = useMemo(() => paintMaterial({
    top: mix(a.path, a.glow, 0.45), bottom: mix(a.monument, a.path, 0.45), fog: a.horizon, y0: 0, y1: steleH, grain: 0.1, rimAmount: 0.5, rim: a.glow,
  }), [a, steleH]);
  useEffect(() => () => { steleGeo?.dispose(); frameGeo?.dispose(); plinthGeo?.dispose(); steleMat.dispose(); }, [steleGeo, frameGeo, plinthGeo, steleMat]);

  return (
    <group position={[exhibit.x, exhibit.y, exhibit.z]} rotation={[0, exhibit.rotY, 0]}>
      <group
        ref={group}
        userData={{ onActivate: onClick }}
        onClick={(e) => { if (e.delta > 6 || store.pointerLocked) return; e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = ""; }}
      >
        {pedestal && plinthGeo && (
          <group position={[0, -exhibit.y, 0.35]}>
            <mesh geometry={plinthGeo} material={steleMat} />
            {/* Invisible hit area around the sculpture that sits on the plinth. */}
            <mesh position={[0, 1.4, 0]} visible={false}>
              <sphereGeometry args={[0.7, 12, 8]} />
            </mesh>
          </group>
        )}
        {!pedestal && steleGeo && frameGeo && (
          <>
            <mesh geometry={steleGeo} material={steleMat} position={[0, -exhibit.y, -0.26]} />
            <mesh position={[0, 0, 0.02]}>
              <planeGeometry args={[w * 1.9, h * 1.9]} />
              <meshBasicMaterial ref={halo} map={getGlow()} color={a.glow} transparent opacity={0} depthWrite={false} toneMapped={false} />
            </mesh>
            <mesh geometry={frameGeo} position={[0, 0, 0.0]}>
              <meshLambertMaterial color={frameColor} />
            </mesh>
            <mesh position={[0, 0, 0.045]}>
              <planeGeometry args={[w, h]} />
              {/* Distinct keys force a fresh material (and shader) once the map arrives. */}
              {tex ? (
                <meshBasicMaterial key="art" map={tex} toneMapped={false} />
              ) : (
                <meshBasicMaterial key="blank" color={a.horizon} toneMapped={false} />
              )}
            </mesh>
          </>
        )}
        <mesh position={[0, pedestal ? -0.32 : -h / 2 - 0.34, pedestal ? 0.93 : 0.03]}>
          <planeGeometry args={[pedestal ? 0.8 : 0.9, pedestal ? 0.15 : 0.17]} />
          <meshBasicMaterial map={plaque} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
