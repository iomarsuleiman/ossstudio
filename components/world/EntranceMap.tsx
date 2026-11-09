"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { GalleryContent, Locale, RoomId } from "@/content";
import { cssFont } from "@/lib/painter";
import { UI } from "@/lib/i18n";
import type { WorldStore } from "@/lib/worldStore";
import { ATMOSPHERE, mix, paintMaterial } from "./paint";
import { useRoomActive } from "./roomActive";

// A large painted map on a pedestal in the centre of the Main Hall. Each room
// floats above it as a glowing orb: touch or click one to travel there.

export const MAP_RADIUS = 2.2;
const MAP_TILT = 0.3; // radians toward the arriving visitor
const SCALE = 1.62; // map units (0–100) → metres on the disc

function toDisc(x: number, y: number) {
  return { x: ((x - 50) / 50) * SCALE, y: (-(y - 50) / 50) * SCALE };
}

function paintMapTexture(content: GalleryContent, locale: Locale) {
  const S = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d")!;
  const px = (v: number) => (v / (MAP_RADIUS * 2)) * S + S / 2;
  const main = ATMOSPHERE.main;
  const bg = ctx.createRadialGradient(S / 2, S / 2, 40, S / 2, S / 2, S / 2);
  bg.addColorStop(0, "#fbf3e7");
  bg.addColorStop(1, mix(main.path, main.monument, 0.25));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 140; i++) {
    ctx.strokeStyle = `rgba(150,110,100,${0.02 + Math.random() * 0.03})`;
    ctx.lineWidth = 6 + Math.random() * 20;
    ctx.beginPath();
    const x = Math.random() * S, y = Math.random() * S;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 40, y + (Math.random() - 0.5) * 30, x + 90, y + (Math.random() - 0.5) * 20);
    ctx.stroke();
  }
  const hub = content.rooms.find((r) => r.id === "main")!;
  const h = toDisc(hub.map.x, hub.map.y);
  // Paths.
  ctx.lineCap = "round";
  for (const r of content.rooms) {
    if (r.id === "main") continue;
    const p = toDisc(r.map.x, r.map.y);
    ctx.strokeStyle = "rgba(120,80,80,0.35)";
    ctx.lineWidth = 7;
    ctx.setLineDash([2, 18]);
    ctx.beginPath();
    ctx.moveTo(px(h.x), px(-h.y));
    ctx.quadraticCurveTo(px((h.x + p.x) / 2 + 0.15), px(-(h.y + p.y) / 2), px(p.x), px(-p.y));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Room pools of colour + names.
  const font = locale === "ar" ? cssFont("--font-cairo", "sans-serif") : cssFont("--font-display", "Georgia, serif");
  ctx.textAlign = "center";
  ctx.direction = locale === "ar" ? "rtl" : "ltr";
  for (const r of content.rooms) {
    const a = ATMOSPHERE[r.id];
    const p = toDisc(r.map.x, r.map.y);
    const x = px(p.x), y = px(-p.y);
    const rad = r.id === "main" ? 92 : 74;
    const g = ctx.createRadialGradient(x, y, 4, x, y, rad);
    g.addColorStop(0, a.glow);
    g.addColorStop(0.55, a.zenith);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a3436";
    const title = r.t[locale].title;
    let size = r.id === "main" ? 38 : 32;
    ctx.font = `600 ${size}px ${font}`;
    while (ctx.measureText(title).width > 250 && size > 18) {
      size -= 2;
      ctx.font = `600 ${size}px ${font}`;
    }
    ctx.fillText(title, x, y + rad * 0.98);
    if (r.id === "main") {
      ctx.font = `400 24px ${cssFont("--font-cairo", "sans-serif")}`;
      ctx.fillStyle = "rgba(74,52,54,0.75)";
      ctx.fillText(UI[locale].youAreHere, x, y + rad * 0.98 + 30);
    }
  }
  // Border ring.
  ctx.strokeStyle = "rgba(120,80,80,0.5)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function Orb({ roomId, x, y, onPick }: { roomId: RoomId; x: number; y: number; onPick: (id: RoomId) => void }) {
  const a = ATMOSPHERE[roomId];
  const ref = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);
  const seed = useMemo(() => x * 7 + y * 3, [x, y]);
  const active = useRoomActive();
  useFrame(({ clock }, dt) => {
    if (!active) return; // a hidden, recently visited room
    const g = ref.current;
    if (!g) return;
    g.position.z = 0.13 + Math.sin(clock.elapsedTime * 0.9 + seed) * 0.03;
    const target = hover ? 1.35 : 1;
    g.scale.setScalar(g.scale.x + (target - g.scale.x) * (1 - Math.exp(-dt / 0.12)));
  });
  return (
    <group ref={ref} position={[x, y, 0.13]}>
      <mesh
        onClick={(e) => { if (e.delta > 6) return; e.stopPropagation(); onPick(roomId); }}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = ""; }}
      >
        <sphereGeometry args={[0.1, 32, 24]} />
        <meshBasicMaterial color={a.zenith} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.16, 24, 16]} />
        <meshBasicMaterial color={a.glow} transparent opacity={hover ? 0.55 : 0.28} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* Larger invisible target so it is easy to hit on touch screens. */}
      <mesh visible={false} onClick={(e) => { if (e.delta > 6) return; e.stopPropagation(); onPick(roomId); }}>
        <sphereGeometry args={[0.32, 12, 8]} />
      </mesh>
    </group>
  );
}

export function EntranceMap({
  content, locale, onRoom,
}: { content: GalleryContent; locale: Locale; store: WorldStore; onRoom: (id: RoomId) => void }) {
  const a = ATMOSPHERE.main;
  const tex = useMemo(() => paintMapTexture(content, locale), [content, locale]);
  useEffect(() => () => tex.dispose(), [tex]);
  const pedestal = useMemo(() => new THREE.LatheGeometry(
    [[0, 0], [1.4, 0], [1.35, 0.07], [0.7, 0.22], [0.42, 0.45], [0.55, 0.62], [0.9, 0.72], [0.88, 0.76], [0, 0.76]]
      .map(([r, y]) => new THREE.Vector2(r, y)), 96,
  ), []);
  useEffect(() => () => pedestal.dispose(), [pedestal]);
  const mat = useMemo(() => paintMaterial({ top: mix(a.path, a.glow, 0.3), bottom: a.monument, fog: a.horizon, y0: 0, y1: 1, rimAmount: 0.45, rim: a.glow }), [a]);
  useEffect(() => () => mat.dispose(), [mat]);

  return (
    <group position={[0, 0, 0]}>
      <mesh geometry={pedestal} material={mat} />
      <group position={[0, 1.12, 0]} rotation={[-Math.PI / 2 + MAP_TILT, 0, 0]}>
        <mesh>
          <circleGeometry args={[MAP_RADIUS, 128]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
        {/* Soft rim and underside so the disc reads as a thick painted plate. */}
        <mesh position={[0, 0, -0.067]} rotation={[Math.PI / 2, 0, 0]} material={mat}>
          <cylinderGeometry args={[MAP_RADIUS + 0.08, MAP_RADIUS - 0.05, 0.12, 128]} />
        </mesh>
        {content.rooms.filter((r) => r.id !== "main").map((r) => {
          const p = toDisc(r.map.x, r.map.y);
          return <Orb key={r.id} roomId={r.id} x={p.x} y={p.y} onPick={onRoom} />;
        })}
      </group>
    </group>
  );
}
