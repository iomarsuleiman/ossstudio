// First-party static files served from /public. Listed here so the Convex
// `assets` table and the client prefetch queue share one manifest.
export interface StaticAsset {
  key: string;
  kind: "texture" | "mask" | "icon" | "data";
  url: string;
  bytes?: number;
  priority: number;
  group: string;
}

export const STATIC_ASSETS: StaticAsset[] = [
  { key: "paper-grain", kind: "texture", url: "/textures/paper.svg", priority: 1, group: "ui" },
  { key: "ink-mask", kind: "mask", url: "/textures/ink-mask.svg", priority: 2, group: "transitions" },
  { key: "brush-mask", kind: "mask", url: "/textures/brush-mask.svg", priority: 2, group: "transitions" },
  { key: "icon", kind: "icon", url: "/icon.svg", priority: 5, group: "ui" },
];
