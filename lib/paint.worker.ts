/// <reference lib="webworker" />
// Paints artworks off the main thread so walking never stutters while a room
// is being prepared. Receives { id, project, room, width }, replies with a
// JPEG blob and how long it took.
import { paintArtwork } from "./painter";
import type { Project, Room } from "@/content";

type Job = { id: number; project: Project; room: Room; width: number };

self.onmessage = async (e: MessageEvent<Job>) => {
  const { id, project, room, width } = e.data;
  const t0 = performance.now();
  try {
    const canvas = paintArtwork(project, room, width) as unknown as OffscreenCanvas;
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.86 });
    (self as unknown as Worker).postMessage({ id, blob, ms: performance.now() - t0 });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
