// Deterministic placement of every artwork, door and bench in the 3D world.
// Shared by the Convex seed (stored in the `exhibits` table) and the bundled
// fallback so both produce identical worlds.
//
// Conventions: each hall runs along the Z axis, entrance at +Z.
// yaw: forward direction is (sin yaw, cos yaw) on the X/Z plane.

import type { RoomId } from "./rooms";
import { MAIN_HALL_HIGHLIGHTS, PHYSICAL_INVENTIONS } from "./rooms";
import { LINUX_DISTRIBUTIONS } from "./catalogue-2";

interface ProjectLike { slug: string; roomId: RoomId; openingOrder?: number; title: string }
interface RoomLike { id: RoomId; order: number }

export interface ExhibitPlacement {
  id: string;
  slug: string;
  roomId: RoomId;
  kind: "frame" | "highlight" | "pedestal";
  x: number; y: number; z: number;
  /** Rotation of the artwork plane around Y (plane faces +Z at 0). */
  rotY: number;
  w: number; h: number;
  spawn: { x: number; z: number; yaw: number };
}

export interface DoorPlacement {
  roomId: RoomId;
  to: RoomId;
  x: number; z: number;
  rotY: number;
  side: "left" | "right" | "front" | "back";
  /** Where the visitor appears when arriving in `roomId` through this door. */
  arrive: { x: number; z: number; yaw: number };
}

export interface RoomShape {
  roomId: RoomId;
  width: number;
  length: number;
  benches: { x: number; z: number }[];
  /** Signed sub-sections within a hall (e.g. Linux Distributions), placed at z. */
  sections?: { id: "linux" | "inventions"; z: number }[];
}

const FRAME_SPACING = 3.6;
const ROOM_WIDTH = 9;
const SPAWN_DIST = 2.4;
const MAIN_W = 16;
const MAIN_L = 24;
const MAIN_DOOR_Z = [-7.5, -2.5, 2.5, 7.5];

export function layoutGallery(rooms: RoomLike[], projects: ProjectLike[]) {
  const exhibits: ExhibitPlacement[] = [];
  const doors: DoorPlacement[] = [];
  const shapes: RoomShape[] = [];
  const ordered = [...rooms].sort((a, b) => a.order - b.order);
  const galleries = ordered.filter((r) => r.id !== "main");

  // --- Main Hall -----------------------------------------------------------
  shapes.push({ roomId: "main", width: MAIN_W, length: MAIN_L, benches: [{ x: 0, z: 0 }] });
  MAIN_HALL_HIGHLIGHTS.forEach((slug, i) => {
    const x = -5.4 + i * 3.6;
    const z = -MAIN_L / 2 + 0.12;
    exhibits.push({
      id: `main:${slug}`, slug, roomId: "main", kind: "highlight",
      x, y: 2.0, z, rotY: 0, w: 2.2, h: 1.6,
      spawn: { x, z: z + SPAWN_DIST + 0.4, yaw: Math.PI },
    });
  });
  galleries.forEach((room, i) => {
    const left = i < 4;
    const z = MAIN_DOOR_Z[i % 4];
    const x = left ? -MAIN_W / 2 : MAIN_W / 2;
    doors.push({
      roomId: "main", to: room.id, x, z, rotY: left ? Math.PI / 2 : -Math.PI / 2,
      side: left ? "left" : "right",
      arrive: { x: left ? x + 1.8 : x - 1.8, z, yaw: left ? Math.PI / 2 : -Math.PI / 2 },
    });
  });

  // --- Galleries -------------------------------------------------------------
  galleries.forEach((room, gi) => {
    const inRoom = projects.filter((p) => p.roomId === room.id);
    const alcove = inRoom.filter((p) => PHYSICAL_INVENTIONS.includes(p.slug));
    const distros = LINUX_DISTRIBUTIONS.map((s) => inRoom.find((p) => p.slug === s)).filter((p): p is ProjectLike => !!p);
    const rest = inRoom
      .filter((p) => !PHYSICAL_INVENTIONS.includes(p.slug) && !LINUX_DISTRIBUTIONS.includes(p.slug))
      .sort((a, b) => {
        const ao = a.openingOrder ?? 999;
        const bo = b.openingOrder ?? 999;
        return ao !== bo ? ao - bo : a.title.localeCompare(b.title);
      });
    // Each signed section starts on a fresh pair and leaves one empty pair for its sign.
    const pairs = Math.ceil(rest.length / 2) + (distros.length ? Math.ceil(distros.length / 2) + 1 : 0) + (alcove.length ? 2 : 0);
    const length = Math.max(18, pairs * FRAME_SPACING + 9);
    const half = length / 2;
    const benches: { x: number; z: number }[] = [];
    for (let z = half - 12; z > -half + 6; z -= 13) benches.push({ x: 0, z });
    const sections: NonNullable<RoomShape["sections"]> = [];
    const shape: RoomShape = { roomId: room.id, width: ROOM_WIDTH, length, benches, sections };
    shapes.push(shape);

    const place = (p: ProjectLike, idx: number, kind: ExhibitPlacement["kind"]) => {
      const left = idx % 2 === 0;
      const z = half - 5 - Math.floor(idx / 2) * FRAME_SPACING;
      const opening = p.openingOrder !== undefined;
      if (kind === "pedestal") {
        const x = left ? -2.6 : 2.6;
        exhibits.push({
          id: `${room.id}:${p.slug}`, slug: p.slug, roomId: room.id, kind,
          x, y: 1.25, z, rotY: left ? Math.PI / 2 : -Math.PI / 2, w: 1.3, h: 1.0,
          spawn: { x: left ? x + SPAWN_DIST - 0.6 : x - SPAWN_DIST + 0.6, z, yaw: left ? -Math.PI / 2 : Math.PI / 2 },
        });
        return;
      }
      const x = left ? -ROOM_WIDTH / 2 + 0.1 : ROOM_WIDTH / 2 - 0.1;
      exhibits.push({
        id: `${room.id}:${p.slug}`, slug: p.slug, roomId: room.id, kind,
        x, y: opening ? 2.0 : 1.9, z,
        rotY: left ? Math.PI / 2 : -Math.PI / 2,
        w: opening ? 2.0 : 1.5, h: opening ? 1.5 : 1.12,
        spawn: { x: left ? x + SPAWN_DIST : x - SPAWN_DIST, z, yaw: left ? -Math.PI / 2 : Math.PI / 2 },
      });
    };
    const zOfIndex = (idx: number) => half - 5 - Math.floor(idx / 2) * FRAME_SPACING;
    rest.forEach((p, i) => place(p, i, "frame"));
    let base = Math.ceil(rest.length / 2) * 2;
    if (distros.length) {
      sections.push({ id: "linux", z: zOfIndex(base) });
      base += 2;
      distros.forEach((p, i) => place(p, base + i, "frame"));
      base += Math.ceil(distros.length / 2) * 2;
    }
    if (alcove.length) {
      sections.push({ id: "inventions", z: zOfIndex(base) });
      base += 2;
      alcove.forEach((p, i) => place(p, base + i, "pedestal"));
    }
    // Keep benches clear of section signs.
    shape.benches = benches.filter((b) => sections.every((s) => Math.abs(s.z - b.z) > 2));

    // Entrance (back to the Main Hall) and onward door to the next gallery.
    const next = galleries[gi + 1]?.id ?? "main";
    doors.push({
      roomId: room.id, to: "main", x: 0, z: half, rotY: Math.PI, side: "back",
      arrive: { x: 0, z: half - 4.4, yaw: Math.PI },
    });
    doors.push({
      roomId: room.id, to: next, x: 0, z: -half, rotY: 0, side: "front",
      arrive: { x: 0, z: -half + 2.2, yaw: 0 },
    });
  });

  return { exhibits, doors, shapes };
}

/** Where a visitor should appear in `to` when walking through a door from `from`. */
export function arrivalFor(doors: DoorPlacement[], from: RoomId, to: RoomId) {
  // Prefer the door in `to` that leads back to `from`.
  const back = doors.find((d) => d.roomId === to && d.to === from);
  if (back) return back.arrive;
  const entrance = doors.find((d) => d.roomId === to && d.side === "back");
  if (entrance) return entrance.arrive;
  return { x: 0, z: 0, yaw: Math.PI };
}
