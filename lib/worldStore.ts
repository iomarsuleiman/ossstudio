// Mutable state shared between the React UI and the render loop. Kept outside
// React state so walking at 60–120 fps never re-renders the interface.
import type { DoorPlacement, ExhibitPlacement, RoomId } from "@/content";

export type WorldMode = "arrival" | "walk" | "entering" | "exhibit" | "exiting" | "transition";

export interface WorldStore {
  roomId: RoomId;
  pos: { x: number; z: number };
  /** Where the visitor is facing (forward = (sin yaw, cos yaw)). */
  yaw: number;
  /** Look up/down, radians. */
  pitch: number;
  /** Smoothed look targets driven by drag, arrow keys and glides. */
  targetYaw: number;
  targetPitch: number;
  vel: { x: number; z: number };
  /** Virtual joystick on touch screens, each axis in [-1, 1]. */
  joy: { x: number; y: number };
  /** Standing by the entrance map. */
  nearMap: boolean;
  /** Camera style: through your own eyes, or third person behind your figure. */
  view: "first" | "third";
  /** 0 = first person, 1 = third person (eased between the two). */
  viewBlend: number;
  /** Which way the figure faces in third person (follows its walking direction). */
  bodyYaw: number;
  keys: Set<string>;
  /** Tap/click-to-move destination (the next waypoint while following a path). */
  target: { x: number; z: number } | null;
  /** Remaining waypoints after `target` for click-to-move. */
  path: { x: number; z: number }[];
  /** Final click-to-move destination, shown as a soft ring on the floor. */
  destination: { x: number; z: number } | null;
  /** Seat to take once the path ends (bench index in this room, seat index). */
  targetSeat: { bench: number; seat: number } | null;
  /** The seat you're on, if any. */
  seat: { bench: number; seat: number } | null;
  /** 0 = standing, 1 = seated (eased). */
  sitBlend: number;
  /** Where you stood before sitting down; you stand back up there. */
  standFrom: { x: number; z: number } | null;
  /** Mouse look (pointer lock) is engaged on desktop. */
  pointerLocked: boolean;
  /** Exhibit to face once the target is reached. */
  targetExhibit: string | null;
  nearby: ExhibitPlacement | null;
  /** Seconds spent standing still near the current artwork. */
  linger: number;
  focusBlend: number;
  mode: WorldMode;
  /** 0 → 1 while the camera moves into a painting. */
  enter: number;
  entering: ExhibitPlacement | null;
  snapCamera: boolean;
  reducedMotion: boolean;
  walkPhase: number;
  onNearby?: (e: ExhibitPlacement | null) => void;
  onDoor?: (d: DoorPlacement) => void;
  onStep?: () => void;
  onArrive?: (e: ExhibitPlacement) => void;
  onNearMap?: (near: boolean) => void;
  /** Within a few steps of a door to another room. */
  onNearDoor?: (to: RoomId) => void;
  /** Asked to sit: resolve to true when the seat is yours (multiplayer may refuse a taken seat). */
  onSitRequest?: (bench: number, seat: number) => Promise<boolean>;
  onSeatChange?: (seat: { bench: number; seat: number } | null) => void;
  /** Walk to a point along a path around obstacles (set by the movement controller). */
  navigate?: (to: { x: number; z: number }) => boolean;
  /** Walk to a bench and sit on its nearest free seat. */
  sitOn?: (bench: number) => void;
  /** Other visitors are moving nearby, so keep drawing smoothly. */
  remoteActive: boolean;
  /** Artwork textures still loading in the current room. */
  texturesPending: number;
  /** Seats other visitors occupy in this room ("bench:seat"). */
  takenSeats: Set<string>;
}

export function createWorldStore(roomId: RoomId, pos: { x: number; z: number }, yaw: number): WorldStore {
  return {
    roomId,
    pos: { ...pos },
    yaw,
    pitch: 0,
    targetYaw: yaw,
    targetPitch: 0,
    vel: { x: 0, z: 0 },
    joy: { x: 0, y: 0 },
    nearMap: false,
    view: "first",
    viewBlend: 0,
    bodyYaw: yaw,
    keys: new Set(),
    target: null,
    path: [],
    destination: null,
    targetSeat: null,
    seat: null,
    sitBlend: 0,
    standFrom: null,
    pointerLocked: false,
    takenSeats: new Set(),
    texturesPending: 0,
    remoteActive: false,
    targetExhibit: null,
    nearby: null,
    linger: 0,
    focusBlend: 0,
    mode: "arrival",
    enter: 0,
    entering: null,
    snapCamera: true,
    reducedMotion: false,
    walkPhase: 0,
  };
}

// Survives client-side navigation (e.g. switching language) so the visitor
// keeps their exact place. Also mirrored to sessionStorage for reloads.
export interface PersistedVisit {
  roomId: RoomId;
  pos: { x: number; z: number };
  yaw: number;
  entered: boolean;
  sound: boolean;
}

const KEY = "osg:visit";
let memory: PersistedVisit | null = null;

export function saveVisit(v: PersistedVisit) {
  memory = v;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

export function loadVisit(): PersistedVisit | null {
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PersistedVisit) : null;
  } catch {
    return null;
  }
}
