"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { BenchPlacement, DoorPlacement, GalleryContent, Locale, Room, RoomId, RoomShape } from "@/content";
import { paintSign } from "@/lib/painter";
import { rng } from "@/lib/painter";
import type { WorldStore } from "@/lib/worldStore";
import { UI } from "@/lib/i18n";
import { Artwork } from "./Artwork";
import { Installation } from "./Installation";
import { EntranceMap } from "./EntranceMap";
import { ATMOSPHERE, FOG, glowMaterial, mix, paintMaterial, skyMaterial, waterMaterial, type Atmosphere } from "./paint";
import { archShape, archTube, hillShape, slabGeometry } from "./shapes";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const INTRO_PANEL_INSET = 7.6;
const DOOR_W = 3.0;
const DOOR_H = 4.4;

function useDisposable<T extends { dispose: () => void }>(make: () => T, deps: unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const v = useMemo(make, deps);
  useEffect(() => () => v.dispose(), [v]);
  return v;
}

function useCanvasTexture(make: () => HTMLCanvasElement, deps: unknown[]) {
  return useDisposable(() => {
    const t = new THREE.CanvasTexture(make());
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, deps);
}

// --- Sky, water, walkway ------------------------------------------------------------

function Sky({ a }: { a: Atmosphere }) {
  const mat = useDisposable(() => skyMaterial(a), [a]);
  useFrame(({ clock }) => { mat.uniforms.uTime.value = clock.elapsedTime; });
  return (
    // Drawn after the opaque scenery, so the depth test skips every sky pixel
    // that a hill, arch or the walkway already covers.
    <mesh material={mat} renderOrder={100} frustumCulled={false} raycast={() => null}>
      <sphereGeometry args={[160, 32, 16]} />
    </mesh>
  );
}

function Water({ a }: { a: Atmosphere }) {
  const mat = useDisposable(() => waterMaterial(a), [a]);
  useFrame(({ clock }) => { mat.uniforms.uTime.value = clock.elapsedTime; });
  return (
    <mesh material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]} raycast={() => null}>
      <planeGeometry args={[400, 400]} />
    </mesh>
  );
}

function Walkway({ shape, a, accent, store, onFloorClick }: { shape: RoomShape; a: Atmosphere; accent: string; store: WorldStore; onFloorClick: (x: number, z: number) => void }) {
  const geo = useDisposable(() => slabGeometry(shape.width + 0.6, shape.length + 0.6, Math.min(3, shape.width / 2.6)), [shape]);
  const mat = useDisposable(() => paintMaterial({ top: a.path, bottom: mix(a.water, a.monument, 0.4), fog: a.horizon, y0: -0.9, y1: 0.05, grain: 0.08, rimAmount: 0.2 }), [a]);
  const runnerGeo = useDisposable(() => new THREE.ShapeGeometry(archlessRunner(shape)), [shape]);
  const runnerMat = useDisposable(() => paintMaterial({ top: mix(accent, a.path, 0.55), bottom: mix(accent, a.path, 0.55), fog: a.horizon, grain: 0.18, rimAmount: 0, opacity: 0.55 }), [a, accent]);
  return (
    <group>
      <mesh
        geometry={geo}
        material={mat}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.55, 0]}
        userData={{ onActivate: (p: THREE.Vector3) => onFloorClick(p.x, p.z) }}
        onClick={(e) => { if (e.delta > 6 || store.pointerLocked) return; e.stopPropagation(); onFloorClick(e.point.x, e.point.z); }}
      />
      <mesh geometry={runnerGeo} material={runnerMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} raycast={() => null} />
    </group>
  );
}

/** A long soft-ended runner down the middle of the walkway. */
function archlessRunner(shape: RoomShape) {
  const w = shape.roomId === "main" ? 3.4 : 1.8;
  const l = shape.length - 4;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -l / 2 + w / 2);
  s.absarc(0, -l / 2 + w / 2, w / 2, Math.PI, 0, false);
  s.lineTo(w / 2, l / 2 - w / 2);
  s.absarc(0, l / 2 - w / 2, w / 2, 0, Math.PI, false);
  s.closePath();
  return s;
}

// --- Architecture ---------------------------------------------------------------------

/** Tall arches spanning the walkway that you walk through, one after another. */
function GateArches({ shape, a }: { shape: RoomShape; a: Atmosphere }) {
  const geo = useDisposable(() => archTube(shape.width + 1.2, shape.roomId === "main" ? 9 : 7.4, 0.16), [shape]);
  const mat = useDisposable(() => paintMaterial({ top: mix(a.monument, a.glow, 0.35), bottom: a.monument, fog: a.horizon, y0: 0, y1: 8, grain: 0.1, rimAmount: 0.5, rim: a.glow }), [a]);
  const zs: number[] = [];
  const half = shape.length / 2;
  for (let z = half - 3.2; z > -half + 2; z -= 7.2) zs.push(z);
  return (
    <group>
      {zs.map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh geometry={geo} material={mat} />
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (shape.width / 2 + 0.6), 0.05, 0]} material={mat}>
              <sphereGeometry args={[0.32, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Portal({ door, content, locale, a }: { door: DoorPlacement; content: GalleryContent; locale: Locale; a: Atmosphere }) {
  const to = content.rooms.find((r) => r.id === door.to)!;
  const ta = ATMOSPHERE[to.id];
  const tube = useDisposable(() => archTube(DOOR_W + 0.5, DOOR_H + 0.4, 0.2), []);
  const tubeMat = useDisposable(() => paintMaterial({ top: mix(a.monument, a.glow, 0.25), bottom: mix(a.monument, "#000000", 0.08), fog: a.horizon, y0: 0, y1: 5, rimAmount: 0.55, rim: a.glow }), [a]);
  const fill = useDisposable(() => new THREE.ShapeGeometry(archShape(DOOR_W, DOOR_H), 48), []);
  const fillMat = useDisposable(() => glowMaterial(ta.glow, ta.zenith, 0.92, DOOR_W, DOOR_H), [ta]);
  const count = content.projects.filter((p) => p.roomId === to.id).length;
  const sign = useCanvasTexture(
    () => paintSign(to.t[locale].title, to.id === "main" ? UI[locale].highlights : UI[locale].roomCount(count), locale, to.palette, 1024, 300),
    [to.id, locale, count],
  );
  useFrame(({ clock }) => { fillMat.uniforms.uTime.value = clock.elapsedTime; });
  // Gallery end portals sit at the end of the walkway; Main Hall portals line its sides.
  return (
    <group position={[door.x, 0, door.z]} rotation={[0, door.rotY, 0]}>
      <mesh geometry={tube} material={tubeMat} position={[0, 0, -0.1]} />
      <mesh geometry={fill} material={fillMat} position={[0, 0, -0.18]} />
      <mesh position={[0, DOOR_H + 0.95, 0]}>
        <planeGeometry args={[2.6, 0.76]} />
        <meshBasicMaterial map={sign} toneMapped={false} transparent />
      </mesh>
    </group>
  );
}

/** A lighter arch over the path that announces a section within a hall. */
function SectionArch({ id, z, shape, locale, room, a }: { id: "linux" | "inventions"; z: number; shape: RoomShape; locale: Locale; room: Room; a: Atmosphere }) {
  const ui = UI[locale];
  const title = id === "linux" ? ui.linuxDistributions : ui.physicalInventions;
  const geo = useDisposable(() => archTube(shape.width - 1.0, 6.2, 0.1), [shape]);
  const mat = useDisposable(() => paintMaterial({ top: a.glow, bottom: mix(a.monument, a.glow, 0.4), fog: a.horizon, y0: 0, y1: 6, rimAmount: 0.5, rim: a.glow }), [a]);
  const sign = useCanvasTexture(() => paintSign(title, room.t[locale].title, locale, room.palette, 1024, 300), [title, locale, room.id]);
  // Stands in the empty bay reserved for the section sign.
  const zz = z;
  return (
    <group position={[0, 0, zz]}>
      <mesh geometry={geo} material={mat} />
      <mesh position={[0, 6.0, 0.05]}>
        <planeGeometry args={[2.8, 0.82]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
    </group>
  );
}

function IntroPanel({ room, locale, shape, a }: { room: Room; locale: Locale; shape: RoomShape; a: Atmosphere }) {
  const sign = useCanvasTexture(() => paintSign(room.t[locale].title, room.t[locale].subtitle, locale, room.palette), [room.id, locale]);
  const geo = useDisposable(() => new THREE.ExtrudeGeometry(archShape(3.0, 2.9), { depth: 0.14, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 4, curveSegments: 48 }), []);
  const mat = useDisposable(() => paintMaterial({ top: mix(a.path, a.glow, 0.4), bottom: mix(a.monument, a.path, 0.5), fog: a.horizon, y0: 0, y1: 3 }), [a]);
  return (
    <group position={[-shape.width / 2 + 2.0, 0, shape.length / 2 - INTRO_PANEL_INSET]} rotation={[0, 0.55, 0]}>
      <mesh geometry={geo} material={mat} position={[0, 0, -0.14]} />
      <mesh position={[0, 1.55, 0.06]}>
        <planeGeometry args={[2.56, 0.8]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Bench({ bench, index, a, store }: { bench: BenchPlacement; index: number; a: Atmosphere; store: WorldStore }) {
  const mat = useDisposable(() => paintMaterial({ top: mix(a.monument, a.path, 0.3), bottom: a.monument, fog: a.horizon, y0: 0, y1: 0.9, rimAmount: 0.4, rim: a.glow }), [a]);
  const sit = () => store.sitOn?.(index);
  return (
    <group
      position={[bench.x, 0, bench.z]}
      rotation={[0, bench.rotY ?? Math.PI, 0]}
      userData={{ onActivate: sit }}
      onClick={(e) => { if (e.delta > 6 || store.pointerLocked) return; e.stopPropagation(); sit(); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }}
    >
      {/* Seat */}
      <mesh material={mat} position={[0, 0.46, 0]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.17, 1.74, 8, 24]} />
      </mesh>
      {/* A low, soft backrest on the side away from the artwork. */}
      <mesh material={mat} position={[0, 0.76, -0.2]} rotation={[0.18, 0, Math.PI / 2]} scale={[1, 1, 0.55]}>
        <capsuleGeometry args={[0.09, 1.6, 6, 20]} />
      </mesh>
      {[-0.72, 0.72].map((dx) => (
        <mesh key={dx} material={mat} position={[dx, 0.2, 0]}>
          <cylinderGeometry args={[0.1, 0.16, 0.42, 24]} />
        </mesh>
      ))}
      {/* Generous invisible hit area so the bench is easy to click. */}
      <mesh position={[0, 0.5, 0]} visible={false}>
        <boxGeometry args={[2.3, 1.1, 0.8]} />
      </mesh>
    </group>
  );
}

/** A soft ring on the floor where click-to-move is heading. */
function DestinationMarker({ store, color }: { store: WorldStore; color: string }) {
  const ring = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const shown = useRef(0);
  useFrame(({ clock }, dt) => {
    const d = store.destination;
    const on = d && store.mode === "walk" ? 1 : 0;
    shown.current += (on - shown.current) * (1 - Math.exp(-dt / 0.12));
    if (!ring.current || !mat.current) return;
    ring.current.visible = shown.current > 0.02;
    if (d) ring.current.position.set(d.x, 0.03, d.z);
    const pulse = store.reducedMotion ? 1 : 1 + Math.sin(clock.elapsedTime * 4) * 0.08;
    ring.current.scale.setScalar(pulse * (0.7 + shown.current * 0.3));
    mat.current.opacity = shown.current * 0.75;
  });
  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={() => null}>
      <ringGeometry args={[0.22, 0.32, 40]} />
      <meshBasicMaterial ref={mat} color={color} transparent opacity={0} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

// --- Painted scenery beyond the walkway -------------------------------------------------

/** All of a room's trees as one mesh (trunks and canopies share one paint). */
function Trees({ trees, a }: { trees: { x: number; z: number; h: number; seed: number }[]; a: Atmosphere }) {
  const geo = useDisposable(() => {
    const parts: THREE.BufferGeometry[] = [];
    const m = new THREE.Matrix4();
    for (const { x, z, h, seed } of trees) {
      const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.15 * Math.sin(seed), h * 0.45, 0), new THREE.Vector3(-0.1 * Math.cos(seed), h * 0.85, 0.05)];
      const trunk = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.07, 6, false);
      trunk.applyMatrix4(m.makeTranslation(x, -0.2, z));
      const crown = new THREE.SphereGeometry(1, 18, 12);
      crown.applyMatrix4(m.compose(new THREE.Vector3(x, -0.2 + h * 0.95, z), new THREE.Quaternion(), new THREE.Vector3(h * 0.32, h * 0.42, h * 0.32)));
      const tuft = new THREE.SphereGeometry(1, 14, 10);
      tuft.applyMatrix4(m.compose(new THREE.Vector3(x + h * 0.18, -0.2 + h * 0.78, z + 0.1), new THREE.Quaternion(), new THREE.Vector3(h * 0.2, h * 0.24, h * 0.2)));
      parts.push(trunk, crown, tuft);
    }
    const merged = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry();
    parts.forEach((g) => g.dispose());
    return merged;
  }, [trees]);
  const mat = useMemo(() => paintMaterial({ top: mix(a.monument, a.glow, 0.2), bottom: mix(a.monument, "#2a2525", 0.25), fog: a.horizon, y0: -0.2, y1: 5, rimAmount: 0.45, rim: a.glow }), [a]);
  return <mesh geometry={geo} material={mat} raycast={() => null} />;
}

type Monument =
  | { kind: "arch"; x: number; z: number; w: number; h: number; rot: number }
  | { kind: "ring"; x: number; z: number; r: number; rot: number }
  | { kind: "orb"; x: number; y: number; z: number; r: number }
  | { kind: "spire"; x: number; z: number; h: number }
  | { kind: "hill"; x: number; z: number; w: number; h: number; layer: number };

function planMonuments(roomId: RoomId, shape: RoomShape): Monument[] {
  const r = rng(`monuments:${roomId}`);
  const out: Monument[] = [];
  const span = shape.length / 2 + 30;
  const side = () => (r() > 0.5 ? 1 : -1);
  for (let i = 0; i < 5; i++) out.push({ kind: "hill", x: (r() - 0.5) * 40, z: -span - 10 - i * 12, w: 80 + r() * 60, h: 6 + r() * 10, layer: i });
  for (let i = 0; i < 6; i++) out.push({ kind: "hill", x: side() * (45 + r() * 20), z: (r() - 0.5) * span * 2, w: 50 + r() * 40, h: 5 + r() * 8, layer: i % 3 });
  for (let i = 0; i < 4; i++) out.push({ kind: "arch", x: side() * (16 + r() * 22), z: (r() - 0.5) * span * 1.6, w: 8 + r() * 14, h: 14 + r() * 22, rot: (r() - 0.5) * 1.2 });
  out.push({ kind: "ring", x: side() * (22 + r() * 12), z: -shape.length / 2 - 6 - r() * 10, r: 9 + r() * 6, rot: (r() - 0.5) * 0.8 });
  for (let i = 0; i < 5; i++) out.push({ kind: "orb", x: side() * (12 + r() * 30), y: 6 + r() * 14, z: (r() - 0.5) * span * 1.5, r: 0.6 + r() * 2.2 });
  for (let i = 0; i < 5; i++) out.push({ kind: "spire", x: side() * (14 + r() * 26), z: (r() - 0.5) * span * 1.6, h: 10 + r() * 24 });
  return out;
}

function Monuments({ roomId, shape, a }: { roomId: RoomId; shape: RoomShape; a: Atmosphere }) {
  const list = useMemo(() => planMonuments(roomId, shape), [roomId, shape]);
  const solid = useMemo(() => paintMaterial({ top: mix(a.monument, a.zenith, 0.35), bottom: mix(a.monument, a.water, 0.2), fog: a.horizon, y0: -1, y1: 30, grain: 0.08, rimAmount: 0.4, rim: a.glow, fogNear: 20, fogFar: 140 }), [a]);
  const orbMat = useMemo(() => paintMaterial({ top: a.glow, bottom: mix(a.glow, a.zenith, 0.5), fog: a.horizon, y0: 0, y1: 25, rimAmount: 0.2, fogNear: 30, fogFar: 160 }), [a]);
  const hillMats = useMemo(() => [0, 1, 2, 3, 4].map((l) => paintMaterial({
    top: mix(a.monument, a.horizon, 0.25 + l * 0.14), bottom: mix(a.water, a.horizon, 0.2 + l * 0.12), fog: a.horizon, y0: 0, y1: 14, grain: 0.06, rimAmount: 0, fogNear: 30, fogFar: 170, side: THREE.DoubleSide,
  })), [a]);

  // The distant architecture never moves: arches, the ring and the spires are
  // one mesh, and each layer of hills is one mesh. A room's whole skyline is
  // a handful of draw calls instead of dozens.
  const { solidGeo, hillGeos } = useMemo(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const solids: THREE.BufferGeometry[] = [];
    const hills: THREE.BufferGeometry[][] = [[], [], [], [], []];
    const spire = new THREE.LatheGeometry(Array.from({ length: 18 }, (_, i) => {
      const t = i / 17;
      return new THREE.Vector2(Math.max(0.001, 0.9 * Math.pow(1 - t, 1.4) * (1 + 0.35 * Math.sin(t * Math.PI))), t);
    }), 24);
    for (const mo of list) {
      if (mo.kind === "arch") {
        const g = archTube(mo.w, mo.h, mo.w * 0.05);
        g.applyMatrix4(m.compose(new THREE.Vector3(mo.x, -0.8, mo.z), q.setFromEuler(new THREE.Euler(0, mo.rot, 0)), new THREE.Vector3(1, 1, 1)));
        solids.push(g);
      } else if (mo.kind === "ring") {
        const g = new THREE.TorusGeometry(mo.r, mo.r * 0.08, 14, 64);
        g.applyMatrix4(m.compose(new THREE.Vector3(mo.x, -1, mo.z), q.setFromEuler(new THREE.Euler(0, mo.rot, 0)), new THREE.Vector3(1, 1, 1)));
        solids.push(g);
      } else if (mo.kind === "spire") {
        const g = spire.clone();
        g.applyMatrix4(m.compose(new THREE.Vector3(mo.x, -0.6, mo.z), q.identity(), new THREE.Vector3(mo.h * 0.08, mo.h, mo.h * 0.08)));
        solids.push(g);
      } else if (mo.kind === "hill") {
        const g = new THREE.ShapeGeometry(hillShape(mo.w, mo.h, 2 + (mo.layer % 3), rng(`hill${mo.x}${mo.z}`)), 1);
        const facing = Math.abs(mo.x) > 30 ? (mo.x > 0 ? -Math.PI / 2 : Math.PI / 2) : 0;
        g.applyMatrix4(m.compose(new THREE.Vector3(mo.x, -0.6, mo.z), q.setFromEuler(new THREE.Euler(0, facing, 0)), new THREE.Vector3(1, 1, 1)));
        hills[mo.layer % 5].push(g);
      }
    }
    spire.dispose();
    const merge = (gs: THREE.BufferGeometry[]) => {
      if (!gs.length) return null;
      const out = mergeGeometries(gs);
      gs.forEach((g) => g.dispose());
      return out;
    };
    return { solidGeo: merge(solids), hillGeos: hills.map(merge) };
  }, [list]);
  useEffect(() => () => { solidGeo?.dispose(); hillGeos.forEach((g) => g?.dispose()); }, [solidGeo, hillGeos]);

  const orbs = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    orbs.current?.children.forEach((c, i) => { c.position.y = (c.userData.y as number) + Math.sin(clock.elapsedTime * 0.25 + i) * 0.6; });
  });
  return (
    <group>
      {solidGeo && <mesh geometry={solidGeo} material={solid} raycast={() => null} />}
      {hillGeos.map((g, i) => g && <mesh key={i} geometry={g} material={hillMats[i]} raycast={() => null} />)}
      <group ref={orbs}>
        {list.filter((m): m is Extract<Monument, { kind: "orb" }> => m.kind === "orb").map((m, i) => (
          <mesh key={i} material={orbMat} position={[m.x, m.y, m.z]} userData={{ y: m.y }} raycast={() => null}>
            <sphereGeometry args={[m.r, 20, 14]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * Slowly drifting petals and dust motes, animated entirely on the GPU: the
 * positions never change on the CPU, a time uniform moves them.
 */
function Motes({ shape, color, store }: { shape: RoomShape; color: string; store: WorldStore }) {
  const COUNT = 260;
  const { size } = useThree();
  const geo = useMemo(() => {
    const r = rng(`motes${shape.roomId}`);
    const pos = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (r() - 0.5) * (shape.width + 16);
      pos[i * 3 + 1] = r() * 7;
      pos[i * 3 + 2] = (r() - 0.5) * (shape.length + 10);
      seeds[i] = r() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3.5, 0), Math.max(shape.width, shape.length) + 20);
    return g;
  }, [shape]);
  useEffect(() => () => geo.dispose(), [geo]);
  const mat = useDisposable(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uScale: { value: 400 }, uFogNear: { value: FOG.near }, uFogFar: { value: FOG.far } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uScale;
      varying float vFade;
      void main() {
        vec3 p = position;
        float speed = 0.08 + fract(aSeed) * 0.1;
        p.y = mod(position.y + uTime * speed, 7.5);
        p.x += -0.4 * cos(uTime * 0.3 + aSeed);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = 0.09 * uScale / -mv.z;
        vFade = 0.85 * smoothstep(0.0, 0.4, p.y) * (1.0 - smoothstep(7.0, 7.5, p.y));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uFogNear;
      uniform float uFogFar;
      varying float vFade;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.4, 1.0, d)) * vFade;
        if (a < 0.01) discard;
        float depth = gl_FragCoord.z / gl_FragCoord.w;
        a *= 1.0 - smoothstep(uFogNear, uFogFar, depth);
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }
    `,
  }), [color]);
  useFrame(({ clock, gl }) => {
    if (store.reducedMotion) return;
    mat.uniforms.uTime.value = clock.elapsedTime;
    mat.uniforms.uScale.value = size.height * 0.5 * gl.getPixelRatio();
  });
  if (store.quality === "low") return null;
  return <points geometry={geo} material={mat} raycast={() => null} />;
}

// --- Room ------------------------------------------------------------------------------------

export function RoomScene({
  content, room, locale, store, onExhibitClick, onFloorClick, onMapRoom,
}: {
  content: GalleryContent;
  room: Room;
  locale: Locale;
  store: WorldStore;
  onExhibitClick: (id: string) => void;
  onFloorClick: (x: number, z: number) => void;
  onMapRoom: (id: RoomId) => void;
}) {
  const shape = content.shapes.find((s) => s.roomId === room.id)!;
  const exhibits = content.exhibits.filter((e) => e.roomId === room.id);
  const doors = content.doors.filter((d) => d.roomId === room.id);
  const isMain = room.id === "main";
  const a = ATMOSPHERE[room.id];

  const trees = useMemo(() => {
    const r = rng(`trees${room.id}`);
    const list: { x: number; z: number; h: number; seed: number }[] = [];
    const half = shape.length / 2;
    for (let z = half; z > -half; z -= 5 + r() * 4) {
      for (const s of [-1, 1]) if (r() > 0.35) list.push({ x: s * (shape.width / 2 + 2.2 + r() * 5), z: z + (r() - 0.5) * 2, h: 2.4 + r() * 2.4, seed: r() * 10 });
    }
    return list;
  }, [room.id, shape]);

  const title = useCanvasTexture(() => paintSign(UI[locale].siteTitle, UI[locale].highlights, locale, room.palette), [locale, room.id]);

  return (
    <group>
      <color attach="background" args={[a.horizon]} />
      <fog attach="fog" args={[a.horizon, FOG.near, FOG.far]} />
      {/* Lights only touch the small sculptures; the world itself is unlit paint. */}
      <hemisphereLight args={[a.glow, a.water, 1.6]} />
      <directionalLight position={[4, 10, 6]} intensity={0.9} color={a.glow} />

      <Sky a={a} />
      <Water a={a} />
      <Monuments roomId={room.id} shape={shape} a={a} />
      <Trees trees={trees} a={a} />
      <Walkway shape={shape} a={a} accent={room.palette.accent} store={store} onFloorClick={onFloorClick} />
      {!isMain && <GateArches shape={shape} a={a} />}
      {!isMain && <IntroPanel room={room} locale={locale} shape={shape} a={a} />}
      {shape.sections?.map((sec) => <SectionArch key={sec.id} id={sec.id} z={sec.z} shape={shape} locale={locale} room={room} a={a} />)}
      {isMain && (
        <>
          <EntranceMap content={content} locale={locale} store={store} onRoom={onMapRoom} />
          <mesh position={[0, 5.4, -shape.length / 2 - 0.4]}>
            <planeGeometry args={[6.4, 2]} />
            <meshBasicMaterial map={title} toneMapped={false} />
          </mesh>
        </>
      )}
      {doors.map((d) => <Portal key={`${d.side}${d.to}`} door={d} content={content} locale={locale} a={a} />)}
      {shape.benches.map((b, i) => <Bench key={i} bench={b} index={i} a={a} store={store} />)}
      <DestinationMarker store={store} color={a.glow} />
      <Motes shape={shape} color={a.glow} store={store} />

      {exhibits.map((e) => {
        const project = content.projects.find((p) => p.slug === e.slug)!;
        return (
          <group key={e.id}>
            <Artwork exhibit={e} project={project} content={content} store={store} atmosphere={a} onClick={() => onExhibitClick(e.id)} />
            {project.motif && <Installation exhibit={e} motif={project.motif} accent={room.palette.accent} trim={a.monument} />}
          </group>
        );
      })}
    </group>
  );
}
