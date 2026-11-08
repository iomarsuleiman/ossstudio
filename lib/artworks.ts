// Painted artworks are generated once, compressed to JPEG blobs and kept as
// object URLs. Rooms decode them to GPU textures only while visible.
import type { GalleryContent, Project, Room } from "@/content";
import { paintArtwork } from "./painter";

const cache = new Map<string, Promise<string>>();
const ready = new Set<string>();

export function artworkUrl(project: Project, room: Room): Promise<string> {
  let p = cache.get(project.slug);
  if (!p) {
    p = new Promise<string>((resolve, reject) => {
      try {
        const canvas = paintArtwork(project, room, project.openingOrder ? 768 : 560);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("toBlob failed"));
            ready.add(project.slug);
            resolve(URL.createObjectURL(blob));
          },
          "image/jpeg",
          0.86,
        );
      } catch (err) {
        reject(err);
      }
    });
    cache.set(project.slug, p);
  }
  return p;
}

export function isArtworkReady(slug: string) {
  return ready.has(slug);
}

export function roomFor(content: GalleryContent, project: Project) {
  return content.rooms.find((r) => r.id === project.roomId) ?? content.rooms[0];
}
