// Deterministic placement of every artwork, door and bench in the 3D world.
// Shared by the Convex seed (stored in the `exhibits` table) and the bundled
// fallback so both produce identical worlds.
//
// Conventions: each hall runs along the Z axis, entrance at +Z.
// yaw: forward direction is (sin yaw, cos yaw) on the X/Z plane.

import type { RoomId } from "./rooms";
import { MAIN_HALL_HIGHLIGHTS, PHYSICAL_INVENTIONS } from "./rooms";
import { LINUX_DISTRIBUTIONS } from "./catalogue-2";

interface ProjectLike { slug: string; roomId: RoomId; openingOrder?: number; title: string; motif?: string }

/** Motifs that get a small animated sculpture in front of their painting. */
export const INSTALLATION_MOTIFS = [
  "chess", "sculpture", "voice", "send", "branches", "wave",
  "reel", "containers", "constellation", "vault", "circuit", "chip",
] as const;
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

export interface BenchPlacement {
  x: number;
  z: number;
  /** Direction a seated visitor faces: forward = (sin rotY, cos rotY). The bench's long side runs across it. */
  rotY?: number;
}

/** Seats per bench and their offsets along the bench. */
export const BENCH_SEATS = [-0.62, 0, 0.62];
export const BENCH_HALF_LENGTH = 1.05;
export const BENCH_HALF_DEPTH = 0.25;

/** World position of a seat, and of the spot in front of it where you stand up. */
export function seatPose(b: BenchPlacement, seat: number) {
  const rot = b.rotY ?? Math.PI;
  const fx = Math.sin(rot), fz = Math.cos(rot); // facing
  const ax = Math.cos(rot), az = -Math.sin(rot); // along the bench
  const o = BENCH_SEATS[seat] ?? 0;
  return {
    x: b.x + ax * o, z: b.z + az * o, yaw: rot,
    standX: b.x + ax * o + fx * 0.62, standZ: b.z + az * o + fz * 0.62,
  };
}

export interface RoomShape {
  roomId: RoomId;
  width: number;
  length: number;
  benches: BenchPlacement[];
  /** Freestanding gallery walls. Visitors walk around their open ends. */
  partitions?: { x: number; z: number; hx: number; hz: number }[];
  /** Signed sub-sections within a hall (e.g. Linux Distributions), placed at z. */
  sections?: { id: "linux" | "inventions"; z: number }[];
}

// Framed pieces need space for the visitor to stop and read without blocking
// the next piece. Width also leaves a generous path around benches and walls.
export const FRAME_SPACING = 7.2;
const ROOM_WIDTH = 14;
const SPAWN_DIST = 3;
const MAIN_W = 22;
const MAIN_L = 34;
const MAIN_DOOR_Z = [-11.5, -4, 4, 11.5];

/** Shared with rendering and navigation so benches reserve the entrance sign's bay. */
export const INTRO_PANEL_INSET = 2.5;

export function layoutGallery(rooms: RoomLike[], projects: ProjectLike[]) {
  const exhibits: ExhibitPlacement[] = [];
  const doors: DoorPlacement[] = [];
  const shapes: RoomShape[] = [];
  const ordered = [...rooms].sort((a, b) => a.order - b.order);
  const galleries = ordered.filter((r) => r.id !== "main");

  // --- Main Hall -----------------------------------------------------------
  // Each pair of highlights has back-to-back seating, clear of the map and portals.
  shapes.push({ roomId: "main", width: MAIN_W, length: MAIN_L, benches: [-5.2, 5.2].flatMap((x) => [{ x, z: -11.4, rotY: Math.PI }, { x, z: -10.65, rotY: 0 }]) });
  MAIN_HALL_HIGHLIGHTS.forEach((slug, i) => {
    const x = -8.1 + i * 5.4;
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
    const length = Math.max(26, pairs * FRAME_SPACING + 16);
    const half = length / 2;
    const benches: BenchPlacement[] = [];
    const sections: NonNullable<RoomShape["sections"]> = [];
    const partitions: NonNullable<RoomShape["partitions"]> = [];
    const shape: RoomShape = { roomId: room.id, width: ROOM_WIDTH, length, benches, partitions, sections };
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
        w: opening ? 2.3 : 1.9, h: opening ? 1.65 : 1.35,
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
    // Give each artwork its own bay. Seating is deliberately sparse, in the
    // open space between selected bays, rather than at every painting.
    const bays = [...new Set(exhibits.filter((e) => e.roomId === room.id).map((e) => e.z))]
      .sort((a, b) => b - a);
    for (let i = 1; i < bays.length - 1; i += 3) {
      const left = Math.floor(i / 3) % 2 === 0;
      benches.push({
        x: left ? -2.2 : 2.2,
        z: (bays[i] + bays[i + 1]) / 2,
        rotY: left ? -Math.PI / 2 : Math.PI / 2,
      });
    }

    // Offset internal gallery walls interrupt the long straight sightline.
    // Each one keeps an aisle at least 5 m wide at its open end. The
    // successive openings alternate, creating wide, navigable turns.
    for (let i = 3; i < bays.length - 1; i += 4) {
      const openOnRight = Math.floor(i / 4) % 2 === 0;
      partitions.push({
        x: openOnRight ? -2.65 : 2.65,
        z: (bays[i - 1] + bays[i]) / 2,
        hx: 4.3,
        hz: 0.2,
      });
    }

    // Entrance (back to the Main Hall) and onward door to the next gallery.
    const next = galleries[gi + 1]?.id ?? "main";
    doors.push({
      roomId: room.id, to: "main", x: 0, z: half, rotY: Math.PI, side: "back",
      arrive: { x: 0, z: half - 3.2, yaw: Math.PI },
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
