import type { RoomId } from "@/content";

export interface Atmosphere {
  zenith: string;
  horizon: string;
  water: string;
  monument: string;
  path: string;
  glow: string;
}

/** One dominant colour story per hall. */
export const ATMOSPHERE: Record<RoomId, Atmosphere> = {
  main:     { zenith: "#e3bdb8", horizon: "#f7ebdd", water: "#e8cfc6", monument: "#c4928f", path: "#f4e6d6", glow: "#fff4e4" },
  everyday: { zenith: "#e8cf96", horizon: "#f8efd9", water: "#eadcb4", monument: "#c4a262", path: "#f5ead2", glow: "#fff6dc" },
  art:      { zenith: "#e39a8f", horizon: "#f8e3d6", water: "#efbfb2", monument: "#c06f67", path: "#f6e4d8", glow: "#fff0e4" },
  ai:       { zenith: "#9fc2c4", horizon: "#edf1ea", water: "#c4d9d5", monument: "#7a9b9c", path: "#eef0e8", glow: "#f6fffb" },
  internet: { zenith: "#bba8cc", horizon: "#f2eaf0", water: "#d6cbe1", monument: "#9580aa", path: "#f1e9ee", glow: "#fbf5ff" },
  files:    { zenith: "#d8c08f", horizon: "#f7f0df", water: "#e7dab9", monument: "#ad935f", path: "#f4ecd9", glow: "#fff8e6" },
  media:    { zenith: "#c47f8c", horizon: "#f3e0dc", water: "#ddaab2", monument: "#975263", path: "#f4e3df", glow: "#fff0ef" },
  behind:   { zenith: "#a3afc6", horizon: "#edeff1", water: "#c8d0dc", monument: "#78849b", path: "#eeeff0", glow: "#f6f9ff" },
  learn:    { zenith: "#b2c69c", horizon: "#eff1e2", water: "#cfdabe", monument: "#8aa076", path: "#f0f0e2", glow: "#fbfff0" },
};

