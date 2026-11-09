"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { NetStore, Remote } from "@/lib/multiplayer/net";
import type { WorldStore } from "@/lib/worldStore";
import { FigureBody, type FigurePose } from "./Figure";
import type { Atmosphere } from "./paint";

// Other visitors in your room: their figure (in their own colour), a name
// tag, and a 💬 bubble above anyone close enough to talk to. Only the nearest
// MAX_DRAWN are drawn so a crowded room stays smooth.

const MAX_DRAWN = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches ? 24 : 40;
const DETAILED = 8;
export const CHAT_RANGE = 3.5;

function nameTexture(name: string, color: string) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 112;
  const ctx = c.getContext("2d")!;
  ctx.font = "600 52px Cairo, system-ui, sans-serif";
  const w = Math.min(500, ctx.measureText(name).width + 70);
  const x = (512 - w) / 2;
  ctx.fillStyle = "rgba(244, 234, 217, 0.88)";
  ctx.beginPath(); ctx.roundRect(x, 14, w, 84, 42); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x + 34, 56, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2f2a2a";
  ctx.textBaseline = "middle";
  ctx.direction = "inherit";
  ctx.fillText(name, x + 54, 58, w - 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let bubbleTex: THREE.Texture | null = null;
function bubbleTexture() {
  if (bubbleTex) return bubbleTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  // A drawn speech bubble (emoji fonts aren't available everywhere).
  ctx.fillStyle = "#fffaf2";
  ctx.strokeStyle = "#86394a";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(10, 14, 108, 78, 30);
  ctx.moveTo(36, 90); ctx.lineTo(30, 116); ctx.lineTo(58, 91);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#86394a";
  for (const dx of [-24, 0, 24]) { ctx.beginPath(); ctx.arc(64 + dx, 53, 8, 0, Math.PI * 2); ctx.fill(); }
  bubbleTex = new THREE.CanvasTexture(c);
  bubbleTex.colorSpace = THREE.SRGBColorSpace;
  return bubbleTex;
}

export function RemoteVisitors({ net, store, atmosphere, onChat }: { net: NetStore; store: WorldStore; atmosphere: Atmosphere; onChat: (id: string) => void }) {
  useSyncExternalStore(net.subscribe, net.getVersion, net.getVersion);
  const [drawn, setDrawn] = useState<string[]>([]);
  const lastPick = useRef(0);

  useFrame(({ clock }, dt) => {
    store.remoteActive = net.sample(Math.min(dt, 0.1));
    // Re-pick the nearest visitors twice a second.
    if (clock.elapsedTime - lastPick.current < 0.5) return;
    lastPick.current = clock.elapsedTime;
    const ids = [...net.remotes.values()]
      .sort((a, b) => Math.hypot(a.x - store.pos.x, a.z - store.pos.z) - Math.hypot(b.x - store.pos.x, b.z - store.pos.z))
      .slice(0, MAX_DRAWN)
      .map((r) => r.id);
    if (ids.length !== drawn.length || ids.some((id, i) => id !== drawn[i])) setDrawn(ids);
  });
  useEffect(() => () => { store.remoteActive = false; }, [store]);

  return (
    <group>
      {drawn.map((id, i) => {
        const r = net.remotes.get(id);
        return r ? <RemoteAvatar key={id} remote={r} net={net} store={store} atmosphere={atmosphere} detail={i < DETAILED} onChat={onChat} /> : null;
      })}
    </group>
  );
}

function RemoteAvatar({ remote, net, store, atmosphere, detail, onChat }: { remote: Remote; net: NetStore; store: WorldStore; atmosphere: Atmosphere; detail: boolean; onChat: (id: string) => void }) {
  const pose = useRef<FigurePose>({ visible: true, x: remote.x, z: remote.z, yaw: remote.yaw, speed: 0, walkPhase: 0, sit: remote.sit, reduced: false });
  const tag = useRef<THREE.Sprite>(null);
  const bubble = useRef<THREE.Sprite>(null);
  const bubbleShown = useRef(0);
  const texture = useMemo(() => nameTexture(remote.name, remote.color), [remote.name, remote.color]);
  useEffect(() => () => texture.dispose(), [texture]);

  const read = () => {
    const p = pose.current;
    p.x = remote.x; p.z = remote.z; p.yaw = remote.yaw;
    p.speed = remote.speed; p.walkPhase = remote.walkPhase; p.sit = remote.sit;
    p.reduced = store.reducedMotion;
    return p;
  };

  useFrame((_, dt) => {
    const head = 1.62 - remote.sit * 0.38;
    tag.current?.position.set(remote.x, head + 0.22, remote.z);
    const d = Math.hypot(remote.x - store.pos.x, remote.z - store.pos.z);
    const canTalk = !!net.me && remote.open && !net.hidden.has(remote.id) && d < CHAT_RANGE && store.mode === "walk";
    bubbleShown.current += ((canTalk ? 1 : 0) - bubbleShown.current) * (1 - Math.exp(-dt / 0.15));
    const b = bubble.current;
    if (b) {
      b.visible = bubbleShown.current > 0.03;
      const bob = store.reducedMotion ? 0 : Math.sin(performance.now() / 400) * 0.03;
      b.position.set(remote.x, head + 0.62 + bob, remote.z);
      b.scale.setScalar(0.34 * (0.6 + 0.4 * bubbleShown.current));
      (b.material as THREE.SpriteMaterial).opacity = bubbleShown.current;
    }
  });

  const chat = () => { if (!bubble.current?.visible) return false; onChat(remote.id); return true; };
  return (
    <group>
      <FigureBody read={read} atmosphere={atmosphere} cape={remote.color} detail={detail} />
      <sprite ref={tag} scale={[1.25, 0.27, 1]} raycast={() => null} renderOrder={5}>
        <spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
      </sprite>
      <sprite
        ref={bubble}
        visible={false}
        renderOrder={6}
        userData={{ onActivate: chat }}
        onClick={(e) => { if (!bubble.current?.visible || store.pointerLocked) return; e.stopPropagation(); chat(); }}
        onPointerOver={(e) => { if (!bubble.current?.visible) return; e.stopPropagation(); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = ""; }}
      >
        <spriteMaterial map={bubbleTexture()} transparent depthWrite={false} depthTest={false} toneMapped={false} />
      </sprite>
    </group>
  );
}
