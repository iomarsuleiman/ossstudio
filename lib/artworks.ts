// Painted artworks are generated once, compressed to JPEG blobs and kept as
// object URLs. Rooms decode them to GPU textures only while visible.
import type { GalleryContent, Project, Room } from "@/content";
import { paintArtwork } from "./painter";

const cache = new Map<string, Promise<string>>();
const ready = new Set<string>();
const urls = new Map<string, string>();

// --- Painting queue ----------------------------------------------------------------
// Artworks are painted one at a time, the room you're in before anything
// prefetched, in a Web Worker when the browser supports OffscreenCanvas, and
// otherwise on the main thread with a yield between paintings, so a room
// arriving never freezes the page in one long task.

type Job = { project: Project; room: Room; urgent: boolean; resolve: (blob: Blob) => void; reject: (e: unknown) => void };
const urgentJobs: Job[] = [];
const backgroundJobs: Job[] = [];
let busy = false;
let worker: Worker | null | undefined;
let nextId = 1;
const waiting = new Map<number, (r: { blob?: Blob; error?: string; ms?: number }) => void>();

function getWorker() {
  if (worker !== undefined) return worker;
  try {
    worker = typeof OffscreenCanvas !== "undefined" && "convertToBlob" in OffscreenCanvas.prototype
      ? new Worker(new URL("./paint.worker.ts", import.meta.url), { type: "module" })
      : null;
    worker?.addEventListener("message", (e: MessageEvent<{ id: number; blob?: Blob; error?: string; ms?: number }>) => {
      waiting.get(e.data.id)?.(e.data);
      waiting.delete(e.data.id);
    });
    worker?.addEventListener("error", () => { worker = null; });
  } catch {
    worker = null;
  }
  return worker;
}

function paintOnMainThread(project: Project, room: Room) {
  return new Promise<Blob>((resolve, reject) => {
    const t0 = performance.now();
    const canvas = paintArtwork(project, room, project.openingOrder ? 768 : 560);
    // Recorded so performance tests can see what painting costs on the main thread.
    performance.measure(`paint:${project.slug}`, { start: t0, end: performance.now() });
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/jpeg", 0.86);
  });
}

function paintInWorker(w: Worker, project: Project, room: Room) {
  return new Promise<Blob>((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, (r) => {
      if (r.blob) {
        performance.mark(`paint-worker:${project.slug}:${Math.round(r.ms ?? 0)}ms`);
        resolve(r.blob);
      } else reject(new Error(r.error ?? "worker failed"));
    });
    w.postMessage({ id, project, room, width: project.openingOrder ? 768 : 560 });
  });
}

const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

async function pump() {
  if (busy) return;
  busy = true;
  while (urgentJobs.length || backgroundJobs.length) {
    const job = (urgentJobs.shift() ?? backgroundJobs.shift())!;
    try {
      const w = getWorker();
      let blob: Blob;
      try { blob = w ? await paintInWorker(w, job.project, job.room) : await paintOnMainThread(job.project, job.room); }
      catch { worker = null; blob = await paintOnMainThread(job.project, job.room); }
      job.resolve(blob);
    } catch (e) {
      job.reject(e);
    }
    await yieldToMain();
  }
  busy = false;
}

/**
 * The painted artwork as an object URL. `background` requests (prefetch) wait
 * behind anything the visitor is looking at; asking again without it promotes
 * the job.
 */
export function artworkUrl(project: Project, room: Room, opts: { background?: boolean } = {}): Promise<string> {
  let p = cache.get(project.slug);
  if (!p) {
    let job!: Job;
    const blobPromise = new Promise<Blob>((resolve, reject) => {
      job = { project, room, urgent: !opts.background, resolve, reject };
    });
    (opts.background ? backgroundJobs : urgentJobs).push(job);
    jobs.set(project.slug, job);
    const mine: Promise<string> = blobPromise.then((blob) => {
      jobs.delete(project.slug);
      // Released while painting? Don't keep it.
      if (cache.get(project.slug) !== mine) throw new Error("released");
      const url = URL.createObjectURL(blob);
      ready.add(project.slug);
      urls.set(project.slug, url);
      return url;
    });
    p = mine;
    cache.set(project.slug, p);
    void pump();
  } else if (!opts.background) {
    // Someone is looking at it now: move it to the front.
    const job = jobs.get(project.slug);
    const i = job ? backgroundJobs.indexOf(job) : -1;
    if (job && i >= 0) { backgroundJobs.splice(i, 1); urgentJobs.push(job); }
  }
  return p;
}
const jobs = new Map<string, Job>();

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
    // Drop queued paintings nobody needs any more.
    const job = jobs.get(slug);
    if (job) {
      for (const list of [urgentJobs, backgroundJobs]) { const i = list.indexOf(job); if (i >= 0) list.splice(i, 1); }
      jobs.delete(slug);
      job.reject(new Error("released"));
    }
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
