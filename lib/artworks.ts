// Painted artworks are generated once, compressed to JPEG blobs and kept as
// object URLs. Rooms decode them to GPU textures only while visible.
import type { GalleryContent, Project, Room } from "@/content";
import { paintArtwork } from "./painter";

const cache = new Map<string, Promise<string>>();
const ready = new Set<string>();
const urls = new Map<string, string>();

export function artworkUrl(project: Project, room: Room): Promise<string> {
  let p = cache.get(project.slug);
  if (!p) {
    p = new Promise<string>((resolve, reject) => {
      try {
        const canvas = paintArtwork(project, room, project.openingOrder ? 768 : 560);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("toBlob failed"));
            const url = URL.createObjectURL(blob);
            // Released while painting? Don't keep it.
            if (cache.get(project.slug) !== p) { URL.revokeObjectURL(url); return reject(new Error("released")); }
            ready.add(project.slug);
            urls.set(project.slug, url);
            resolve(url);
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

/**
 * Free every painted artwork except `keep` (the room you're in and the rooms
 * you can walk to from it). Anything released is simply painted again if you
 * travel there later.
 */
export function releaseArtworks(keep: Set<string>) {
  for (const slug of [...cache.keys()]) {
    if (keep.has(slug)) continue;
    cache.delete(slug);
    ready.delete(slug);
    const url = urls.get(slug);
    if (url) { URL.revokeObjectURL(url); urls.delete(slug); }
  }
}

/** Rooms you can reach from `roomId` through its doors, nearest door first. */
export function reachableRooms(content: GalleryContent, roomId: string, from?: { x: number; z: number }) {
  const doors = content.doors.filter((d) => d.roomId === roomId);
  if (from) doors.sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z));
  return [...new Set(doors.map((d) => d.to))].filter((r) => r !== roomId);
}

/** Projects whose artworks hang (or are shown as highlights) in a room. */
export function projectsShownIn(content: GalleryContent, roomId: string) {
  const slugs = new Set(content.exhibits.filter((e) => e.roomId === roomId).map((e) => e.slug));
  return content.projects.filter((p) => slugs.has(p.slug));
}

export function isArtworkReady(slug: string) {
  return ready.has(slug);
}

export function roomFor(content: GalleryContent, project: Project) {
  return content.rooms.find((r) => r.id === project.roomId) ?? content.rooms[0];
}
