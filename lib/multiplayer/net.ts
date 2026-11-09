// Client-side state for other visitors, shared between the React layer
// (which receives Convex updates) and the render loop (which draws them).
// Kept outside React so 60 fps drawing never re-renders the interface.
//
// Smoothing: each visitor's updates arrive a few times a second. We keep a
// short buffer of timed snapshots and draw everyone slightly in the past
// (snapshot interpolation), so movement looks continuous whatever the send
// rate, and a late packet never makes anyone jump.

export interface RemoteRow {
  id: string;
  n: string; // name
  c: string; // colour
  x: number;
  z: number;
  y: number; // yaw
  m: boolean; // moving
  s: string | null; // seat "bench:seat"
  t: number; // server time of this update
  o: boolean; // accepts new private messages
}

interface Snap { t: number; x: number; z: number; yaw: number }

export interface Remote {
  id: string;
  name: string;
  color: string;
  seat: string | null;
  open: boolean;
  snaps: Snap[];
  /** Drawn pose (updated by `sample`). */
  x: number;
  z: number;
  yaw: number;
  speed: number;
  walkPhase: number;
  sit: number;
}

export type NetStatus = "off" | "connecting" | "live" | "busy" | "offline";

const MAX_SNAPS = 12;

export class NetStore {
  remotes = new Map<string, Remote>();
  /** Me, once joined. */
  me: { id: string; name: string; color: string; allowDMs: boolean } | null = null;
  status: NetStatus = "off";
  /** Live head counts: whole gallery and per room. */
  counts: { total: number; rooms: Record<string, number> } | null = null;
  /** Visitors whose chat icon should not show (blocked by me). */
  hidden = new Set<string>();
  /** Estimated (local clock - server clock) from the fastest recent update. */
  private offset: number | null = null;
  /** How far in the past remote visitors are drawn, ms (follows the frame cadence). */
  delay = 700;
  private lastIngest = 0;
  private cadence = 500;
  /** Updates received per second (for the debug overlay and load tests). */
  stats = { updates: 0, bytes: 0, lastSecondUpdates: 0, lastSecondBytes: 0, windowStart: 0 };
  private listeners = new Set<() => void>();
  private version = 0;

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => void this.listeners.delete(fn); };
  getVersion = () => this.version;
  private bump() { this.version++; this.listeners.forEach((l) => l()); }

  setStatus(s: NetStatus) { if (s !== this.status) { this.status = s; this.bump(); } }
  setMe(me: NetStore["me"]) { this.me = me; this.bump(); }
  setCounts(c: NetStore["counts"]) { this.counts = c; this.bump(); }
  setHidden(ids: Iterable<string>) { this.hidden = new Set(ids); this.bump(); }

  /** A new room snapshot from the server (all visitors in my room). */
  ingest(rows: RemoteRow[], sizeBytes: number) {
    const now = performance.now();
    this.trackStats(now, sizeBytes);
    // Frames come every 0.5–1 s; draw far enough behind to always have the next one.
    if (this.lastIngest) this.cadence += (Math.min(3000, now - this.lastIngest) - this.cadence) * 0.2;
    this.lastIngest = now;
    this.delay = Math.max(300, Math.min(1600, this.cadence * 1.4 + 150));
    const seen = new Set<string>();
    let membershipChanged = false;
    for (const row of rows) {
      if (row.id === this.me?.id) continue;
      seen.add(row.id);
      // The smallest (local - server) gap is the closest to pure clock offset.
      const gap = Date.now() - row.t;
      if (this.offset === null || gap < this.offset) this.offset = gap;
      let r = this.remotes.get(row.id);
      if (!r) {
        r = { id: row.id, name: row.n, color: row.c, seat: row.s, open: row.o, snaps: [], x: row.x, z: row.z, yaw: row.y, speed: 0, walkPhase: 0, sit: row.s ? 1 : 0 };
        this.remotes.set(row.id, r);
        membershipChanged = true;
      }
      if (r.name !== row.n || r.color !== row.c || r.open !== row.o) membershipChanged = true;
      r.name = row.n; r.color = row.c; r.seat = row.s; r.open = row.o;
      const last = r.snaps[r.snaps.length - 1];
      if (!last || row.t > last.t) {
        r.snaps.push({ t: row.t, x: row.x, z: row.z, yaw: row.y });
        if (r.snaps.length > MAX_SNAPS) r.snaps.shift();
      }
    }
    for (const id of [...this.remotes.keys()]) if (!seen.has(id)) { this.remotes.delete(id); membershipChanged = true; }
    // Let the offset estimate relax slowly so a clock change can't freeze anyone.
    if (this.offset !== null) this.offset += 2;
    if (membershipChanged) this.bump();
  }

  clear() {
    if (!this.remotes.size) return;
    this.remotes.clear();
    this.bump();
  }

  private trackStats(now: number, bytes: number) {
    const s = this.stats;
    if (now - s.windowStart > 1000) {
      s.lastSecondUpdates = s.updates; s.lastSecondBytes = s.bytes;
      s.updates = 0; s.bytes = 0; s.windowStart = now;
    }
    s.updates++;
    s.bytes += bytes;
  }

  /** Advance every remote visitor's drawn pose to "now − delay". Returns true if anyone is moving. */
  sample(dt: number) {
    const renderT = Date.now() - (this.offset ?? 0) - this.delay;
    let anyMoving = false;
    for (const r of this.remotes.values()) {
      const px = r.x, pz = r.z;
      const s = r.snaps;
      if (s.length) {
        let i = s.length - 1;
        while (i > 0 && s[i - 1].t > renderT) i--;
        const b = s[i], a = s[Math.max(0, i - 1)];
        let x: number, z: number, yaw: number;
        if (renderT >= b.t || a === b) { x = b.x; z = b.z; yaw = b.yaw; }
        else if (renderT <= a.t) { x = a.x; z = a.z; yaw = a.yaw; }
        else {
          const k = (renderT - a.t) / (b.t - a.t);
          x = a.x + (b.x - a.x) * k;
          z = a.z + (b.z - a.z) * k;
          yaw = a.yaw + angleDelta(a.yaw, b.yaw) * k;
        }
        // A light final smoothing hides any remaining stutter.
        const f = 1 - Math.exp(-dt / 0.06);
        r.x += (x - r.x) * f;
        r.z += (z - r.z) * f;
        r.yaw += angleDelta(r.yaw, yaw) * f;
      }
      const sp = Math.hypot(r.x - px, r.z - pz) / Math.max(dt, 1e-3);
      r.speed += (Math.min(sp, 3) - r.speed) * (1 - Math.exp(-dt / 0.15));
      r.walkPhase += r.speed * dt * 4.6;
      r.sit += ((r.seat ? 1 : 0) - r.sit) * (1 - Math.exp(-dt / 0.25));
      if (r.speed > 0.05 || Math.abs(r.sit - (r.seat ? 1 : 0)) > 0.01) anyMoving = true;
    }
    return anyMoving;
  }
}

function angleDelta(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
