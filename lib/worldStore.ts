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
  /** Camera style: through your own eyes, or side-on watching your figure. */
  view: "first" | "side";
  /** 0 = first person, 1 = side view (eased between the two). */
  viewBlend: number;
  /** Side view: which side of the path the camera is on (+1 = +x). */
  sideSign: 1 | -1;
  /** Side view: camera orbit angle around the visitor (eases when flipping). */
  sideAngle: number;
  /** Side view: keep "toward/away" input steady across a camera flip until released. */
  depthInvert: boolean;
  keys: Set<string>;
  /** Tap/click-to-move destination. */
  target: { x: number; z: number } | null;
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
    sideSign: 1,
    sideAngle: 0,
    depthInvert: false,
    keys: new Set(),
    target: null,
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
