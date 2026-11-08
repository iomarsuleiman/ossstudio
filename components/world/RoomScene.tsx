"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { DoorPlacement, GalleryContent, Locale, Room, RoomShape } from "@/content";
import { paintFloor, paintSign, paintWall } from "@/lib/painter";
import type { WorldStore } from "@/lib/worldStore";
import { Artwork } from "./Artwork";
import { Installation } from "./Installation";
import { UI } from "@/lib/i18n";

const DOOR_W = 2.6;
const DOOR_H = 3.6;
const T = 0.3; // wall thickness
export const INTRO_PANEL_INSET = 7.6;

function useCanvasTexture(make: () => HTMLCanvasElement, deps: unknown[], repeat?: [number, number]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(make());
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
    }
    return t;
  }, deps);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

function archShape(w: number, h: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, h - w / 2);
  s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true);
  s.lineTo(w / 2, 0);
  s.closePath();
  return s;
}

/** A straight wall from -len/2..len/2 along local X with arched openings. */
function Wall({
  len, height, openings, material, trim,
}: { len: number; height: number; openings: number[]; material: THREE.Material; trim: string }) {
  const sorted = [...openings].sort((a, b) => a - b);
  const segments: [number, number][] = [];
  let start = -len / 2;
  for (const o of sorted) {
    segments.push([start, o - DOOR_W / 2]);
    start = o + DOOR_W / 2;
  }
  segments.push([start, len / 2]);
  return (
    <group>
      {segments.filter(([a, b]) => b - a > 0.01).map(([a, b], i) => (
        <mesh key={i} position={[(a + b) / 2, height / 2, 0]} material={material}>
          <boxGeometry args={[b - a, height, T]} />
        </mesh>
      ))}
      {sorted.map((o, i) => (
        <group key={`o${i}`} position={[o, 0, 0]}>
          <mesh position={[0, (height + DOOR_H) / 2, 0]} material={material}>
            <boxGeometry args={[DOOR_W, height - DOOR_H, T]} />
          </mesh>
          {/* Arched reveal so the doorway reads as an arch, not a rectangle. */}
          <ArchFill width={DOOR_W} height={DOOR_H} material={material} />
          <mesh position={[0, DOOR_H + 0.12, T / 2 + 0.02]}>
            <boxGeometry args={[DOOR_W + 0.5, 0.14, 0.06]} />
            <meshLambertMaterial color={trim} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, height - 0.15, T / 2 + 0.06]}>
        <boxGeometry args={[len, 0.3, 0.12]} />
        <meshLambertMaterial color={trim} />
      </mesh>
      <mesh position={[0, 0.12, T / 2 + 0.03]}>
        <boxGeometry args={[len, 0.24, 0.06]} />
        <meshLambertMaterial color={trim} />
      </mesh>
    </group>
  );
}

/** Fills the rectangular top corners of an opening, leaving an arch. */
function ArchFill({ width, height, material }: { width: number; height: number; material: THREE.Material }) {
  const geo = useMemo(() => {
    const outer = new THREE.Shape();
    const r = width / 2;
    outer.moveTo(-r, height - r);
    outer.lineTo(-r, height);
    outer.lineTo(r, height);
    outer.lineTo(r, height - r);
    outer.absarc(0, height - r, r, 0, Math.PI, false);
    return new THREE.ExtrudeGeometry(outer, { depth: T, bevelEnabled: false });
  }, [width, height]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} position={[0, 0, -T / 2]} material={material} />;
}

function Doorway({ door, content, locale, palette }: { door: DoorPlacement; content: GalleryContent; locale: Locale; palette: Room["palette"] }) {
  const to = content.rooms.find((r) => r.id === door.to)!;
  const sign = useCanvasTexture(
    () => paintSign(
      to.t[locale].title,
      to.id === "main" ? UI[locale].highlights : UI[locale].roomCount(content.projects.filter((p) => p.roomId === to.id).length),
      locale, palette, 1024, 300,
    ),
    [to.id, locale],
  );
  const beyond = useMemo(() => archShape(DOOR_W - 0.05, DOOR_H - 0.05), []);
  return (
    <group position={[door.x, 0, door.z]} rotation={[0, door.rotY, 0]}>
      {/* Glowing view into the next hall's atmosphere. */}
      <mesh position={[0, 0, -T / 2 - 0.05]}>
        <shapeGeometry args={[beyond]} />
        <meshBasicMaterial color={to.palette.fog} toneMapped={false} />
      </mesh>
      <mesh position={[0, DOOR_H + 0.75, T / 2 + 0.08]}>
        <planeGeometry args={[2.6, 0.76]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      {/* Soft light pool on the floor in front of the door. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 1.2]}>
        <circleGeometry args={[1.5, 32]} />
        <meshBasicMaterial color={to.palette.fog} transparent opacity={0.18} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Cypress({ x, z, h, color }: { x: number; z: number; h: number; color: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.32, 0.26, 0.6, 12]} />
        <meshLambertMaterial color="#a77d63" />
      </mesh>
      <mesh position={[0, 0.6 + h / 2, 0]} scale={[1, 1, 1]}>
        <sphereGeometry args={[0.36, 10, 16]} />
        <meshLambertMaterial color={color} flatShading />
      </mesh>
      <mesh position={[0, 0.6 + h * 0.55, 0]}>
        <coneGeometry args={[0.38, h, 10]} />
        <meshLambertMaterial color={color} flatShading />
      </mesh>
    </group>
  );
}

function Bench({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[2.0, 0.12, 0.6]} />
        <meshLambertMaterial color={color} />
      </mesh>
      {[-0.8, 0.8].map((dx) => (
        <mesh key={dx} position={[dx, 0.2, 0]}>
          <boxGeometry args={[0.14, 0.4, 0.5]} />
          <meshLambertMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}

function Windows({ len, height, x, rotY, color, skip }: { len: number; height: number; x: number; rotY: number; color: string; skip: number[] }) {
  const shape = useMemo(() => archShape(1.1, 1.9), []);
  const zs: number[] = [];
  for (let z = len / 2 - 3; z > -len / 2 + 2; z -= 3.6) if (!skip.some((d) => Math.abs(d - z) < 1.8)) zs.push(z);
  return (
    <group>
      {zs.map((z) => (
        <mesh key={z} position={[x, height - 2.6, z]} rotation={[0, rotY, 0]}>
          <shapeGeometry args={[shape]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Painterly shafts of light falling from the high windows. */
function LightShafts({ shape, color }: { shape: RoomShape; color: string }) {
  const zs: number[] = [];
  for (let z = shape.length / 2 - 5; z > -shape.length / 2 + 3; z -= 7.2) zs.push(z);
  return (
    <group>
      {zs.map((z, i) => (
        <mesh key={z} position={[(i % 2 ? 1 : -1) * shape.width * 0.18, 2.6, z]} rotation={[0, 0, (i % 2 ? -1 : 1) * 0.5]}>
          <planeGeometry args={[1.4, 6.5]} />
          <meshBasicMaterial color={color} transparent opacity={0.09} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

export function RoomScene({
  content, room, locale, store, onExhibitClick, onFloorClick,
}: {
  content: GalleryContent;
  room: Room;
  locale: Locale;
  store: WorldStore;
  onExhibitClick: (id: string) => void;
  onFloorClick: (x: number, z: number) => void;
}) {
  const shape = content.shapes.find((s) => s.roomId === room.id)!;
  const exhibits = content.exhibits.filter((e) => e.roomId === room.id);
  const doors = content.doors.filter((d) => d.roomId === room.id);
  const isMain = room.id === "main";
  const H = isMain ? 7.5 : 5.8;
  const { width: W, length: L } = shape;
  const pal = room.palette;

  const wallTex = useCanvasTexture(() => paintWall(pal, room.id), [room.id], [Math.max(1, L / 6), 1]);
  const wallTexShort = useCanvasTexture(() => paintWall(pal, room.id + "e"), [room.id], [Math.max(1, W / 6), 1]);
  const floorTex = useCanvasTexture(() => paintFloor(pal, room.id), [room.id], [W / 3, L / 3]);
  const wallMat = useMemo(() => new THREE.MeshLambertMaterial({ map: wallTex }), [wallTex]);
  const endMat = useMemo(() => new THREE.MeshLambertMaterial({ map: wallTexShort }), [wallTexShort]);
  useEffect(() => () => { wallMat.dispose(); endMat.dispose(); }, [wallMat, endMat]);

  const roomSign = useCanvasTexture(
    () => paintSign(room.t[locale].title, room.t[locale].subtitle, locale, pal),
    [room.id, locale],
  );
  const titleSign = useCanvasTexture(
    () => paintSign(UI[locale].siteTitle, UI[locale].highlights, locale, pal),
    [locale],
  );

  // Left wall is rotated +90°, so its local X runs along world -Z; the right wall is the opposite.
  const sideDoors = (side: "left" | "right") => doors.filter((d) => d.side === side).map((d) => (side === "left" ? -d.z : d.z));
  const endDoor = (side: "front" | "back") => doors.filter((d) => d.side === side).map((d) => d.x * (side === "front" ? 1 : -1));

  const cypresses = useMemo(() => {
    const list: { x: number; z: number; h: number }[] = [];
    list.push({ x: -W / 2 + 0.8, z: L / 2 - 0.9, h: 2.4 }, { x: W / 2 - 0.8, z: L / 2 - 0.9, h: 2.2 });
    list.push({ x: -W / 2 + 0.8, z: -L / 2 + 0.9, h: 2.6 }, { x: W / 2 - 0.8, z: -L / 2 + 0.9, h: 2.3 });
    return list;
  }, [W, L]);

  return (
    <group>
      <color attach="background" args={[pal.fog]} />
      <fog attach="fog" args={[pal.fog, isMain ? 14 : 10, isMain ? 46 : 42]} />
      <hemisphereLight args={["#fff6ea", pal.floor, 1.25]} />
      <directionalLight position={[6, 12, 8]} intensity={1.1} color="#ffe9d2" />
      <ambientLight intensity={0.25} />

      {/* Floor and central runner. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onFloorClick(e.point.x, e.point.z); }}
      >
        <planeGeometry args={[W, L]} />
        <meshLambertMaterial map={floorTex} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} raycast={() => null}>
        <planeGeometry args={[isMain ? 4 : 2.4, L - 3]} />
        <meshLambertMaterial color={pal.accent} transparent opacity={0.28} depthWrite={false} />
      </mesh>

      {/* Walls (local X runs along each wall; front of wall faces inward). */}
      <group position={[-W / 2 - T / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <Wall len={L} height={H} openings={sideDoors("left")} material={wallMat} trim={pal.trim} />
      </group>
      <group position={[W / 2 + T / 2, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <Wall len={L} height={H} openings={sideDoors("right")} material={wallMat} trim={pal.trim} />
      </group>
      <group position={[0, 0, -L / 2 - T / 2]}>
        <Wall len={W + T * 2} height={H} openings={endDoor("front")} material={endMat} trim={pal.trim} />
      </group>
      <group position={[0, 0, L / 2 + T / 2]} rotation={[0, Math.PI, 0]}>
        <Wall len={W + T * 2} height={H} openings={endDoor("back")} material={endMat} trim={pal.trim} />
      </group>

      {/* Pilasters between artworks. */}
      {!isMain && [-1, 1].map((side) => {
        const zs: number[] = [];
        for (let z = L / 2 - 5 + 1.8; z > -L / 2 + 1; z -= 3.6) zs.push(z);
        return zs.map((z) => (
          <mesh key={`${side}${z}`} position={[side * (W / 2 - 0.12), H / 2, z]}>
            <boxGeometry args={[0.24, H, 0.42]} />
            <meshLambertMaterial color={pal.wall} />
          </mesh>
        ));
      })}

      <Windows len={L} height={H} x={-W / 2 + 0.02} rotY={Math.PI / 2} color="#fff8ec"
        skip={isMain ? doors.filter((d) => d.side === "left").map((d) => d.z) : []} />
      <Windows len={L} height={H} x={W / 2 - 0.02} rotY={-Math.PI / 2} color="#fff8ec"
        skip={isMain ? doors.filter((d) => d.side === "right").map((d) => d.z) : []} />
      <LightShafts shape={shape} color="#fff5e1" />

      {/* Signs. */}
      {isMain ? (
        <mesh position={[0, 4.6, -L / 2 + 0.12]}>
          <planeGeometry args={[6.4, 2]} />
          <meshBasicMaterial map={titleSign} toneMapped={false} />
        </mesh>
      ) : (
        // A freestanding introduction panel just inside the entrance.
        <group position={[0, 0, L / 2 - INTRO_PANEL_INSET]}>
          <mesh position={[0, 1.55, 0]} rotation={[-0.08, 0, 0]}>
            <planeGeometry args={[2.4, 0.75]} />
            <meshBasicMaterial map={roomSign} toneMapped={false} />
          </mesh>
          <mesh position={[0, 1.55, -0.03]} rotation={[-0.08, 0, 0]}>
            <boxGeometry args={[2.52, 0.86, 0.04]} />
            <meshLambertMaterial color={pal.trim} />
          </mesh>
          {[-0.9, 0.9].map((x) => (
            <mesh key={x} position={[x, 0.6, -0.08]} rotation={[0.1, 0, 0]}>
              <boxGeometry args={[0.06, 1.25, 0.06]} />
              <meshLambertMaterial color={pal.trim} />
            </mesh>
          ))}
        </group>
      )}

      {doors.map((d) => (
        <Doorway key={`${d.side}${d.to}`} door={d} content={content} locale={locale} palette={pal} />
      ))}

      {shape.benches.map((b, i) => <Bench key={i} x={b.x} z={b.z} color={pal.trim} />)}
      {isMain && <CentrePiece color={pal.accent} trim={pal.trim} />}
      {cypresses.map((c, i) => <Cypress key={i} {...c} color={i % 2 ? "#6e7d5c" : "#5e6b4f"} />)}

      {exhibits.map((e) => {
        const project = content.projects.find((p) => p.slug === e.slug)!;
        return (
          <group key={e.id}>
            <Artwork exhibit={e} project={project} content={content} store={store} onClick={() => onExhibitClick(e.id)} />
            {project.motif && <Installation exhibit={e} motif={project.motif} accent={pal.accent} trim={pal.trim} />}
          </group>
        );
      })}
    </group>
  );
}

function CentrePiece({ color, trim }: { color: string; trim: string }) {
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[2.0, 2.2, 0.5, 40]} />
        <meshLambertMaterial color={trim} />
      </mesh>
      <mesh position={[0, 0.52, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.8, 40]} />
        <meshLambertMaterial color={color} />
      </mesh>
    </group>
  );
}
