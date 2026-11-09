// Click-to-move pathfinding: a coarse walkability grid over a room's walkway,
// A* across it, then string-pulling so the walk follows smooth straight lines.
// Pure TypeScript with no three.js, so it can be unit tested.

export interface Collider { x: number; z: number; hx?: number; hz?: number; r?: number }
export interface Point { x: number; z: number }

const CELL = 0.25;

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private readonly blocked: Uint8Array;
  private readonly x0: number;
  private readonly z0: number;

  constructor(width: number, length: number, colliders: Collider[], radius: number) {
    const hw = width / 2 - radius, hl = length / 2 - radius;
    this.x0 = -hw;
    this.z0 = -hl;
    this.cols = Math.max(1, Math.floor((hw * 2) / CELL) + 1);
    this.rows = Math.max(1, Math.floor((hl * 2) / CELL) + 1);
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.centre(c, r);
        if (hits(colliders, p.x, p.z, radius + 0.04)) this.blocked[r * this.cols + c] = 1;
      }
    }
  }

  private centre(c: number, r: number): Point {
    return { x: this.x0 + c * CELL, z: this.z0 + r * CELL };
  }

  private cellOf(p: Point) {
    const c = Math.round((p.x - this.x0) / CELL), r = Math.round((p.z - this.z0) / CELL);
    return { c: Math.max(0, Math.min(this.cols - 1, c)), r: Math.max(0, Math.min(this.rows - 1, r)) };
  }

  isFree(p: Point) {
    const { c, r } = this.cellOf(p);
    return !this.blocked[r * this.cols + c];
  }

  /** Nearest walkable point to p (p itself when it is already walkable). */
  nearestFree(p: Point): Point | null {
    const { c, r } = this.cellOf(p);
    if (!this.blocked[r * this.cols + c]) return this.clamp(p);
    for (let ring = 1; ring < Math.max(this.cols, this.rows); ring++) {
      let best: Point | null = null, bestD = Infinity;
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const cc = c + dc, rr = r + dr;
          if (cc < 0 || rr < 0 || cc >= this.cols || rr >= this.rows || this.blocked[rr * this.cols + cc]) continue;
          const q = this.centre(cc, rr);
          const d = Math.hypot(q.x - p.x, q.z - p.z);
          if (d < bestD) { bestD = d; best = q; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  private clamp(p: Point): Point {
    return {
      x: Math.max(this.x0, Math.min(this.x0 + (this.cols - 1) * CELL, p.x)),
      z: Math.max(this.z0, Math.min(this.z0 + (this.rows - 1) * CELL, p.z)),
    };
  }

  /** True when a straight walk from a to b stays on walkable cells. */
  lineFree(a: Point, b: Point) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(d / (CELL * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!this.isFree({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
    }
    return true;
  }

  /**
   * Waypoints from `from` to (the nearest reachable point to) `to`, excluding
   * the start. Returns null when nothing reachable exists.
   */
  path(from: Point, to: Point): Point[] | null {
    const goal = this.nearestFree(to);
    if (!goal) return null;
    const start = this.isFree(from) ? from : this.nearestFree(from) ?? from;
    if (this.lineFree(start, goal)) return [goal];

    const s = this.cellOf(start), g = this.cellOf(goal);
    const n = this.cols * this.rows;
    const gScore = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const si = s.r * this.cols + s.c, gi = g.r * this.cols + g.c;
    gScore[si] = 0;
    heap.push(si, 0);
    const h = (i: number) => Math.hypot((i % this.cols) - g.c, Math.floor(i / this.cols) - g.r);
    let found = false;
    while (heap.size) {
      const cur = heap.pop();
      if (cur === gi) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cc = cur % this.cols, cr = Math.floor(cur / this.cols);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = cc + dc, nr = cr + dr;
          if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
          const ni = nr * this.cols + nc;
          if (this.blocked[ni] || closed[ni]) continue;
          // No cutting corners past a blocked cell.
          if (dr && dc && (this.blocked[cr * this.cols + nc] || this.blocked[nr * this.cols + cc])) continue;
          const cost = gScore[cur] + (dr && dc ? Math.SQRT2 : 1);
          if (cost < gScore[ni]) {
            gScore[ni] = cost;
            came[ni] = cur;
            heap.push(ni, cost + h(ni));
          }
        }
      }
    }
    if (!found) return null;
    const cells: Point[] = [];
    for (let i = gi; i !== -1 && i !== si; i = came[i]) cells.push(this.centre(i % this.cols, Math.floor(i / this.cols)));
    cells.reverse();
    cells[cells.length - 1] = goal;

    // String-pull: skip every waypoint you can walk straight past.
    const out: Point[] = [];
    let anchor = start;
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.lineFree(anchor, cells[j])) j--;
      out.push(cells[j]);
      anchor = cells[j];
      i = j + 1;
    }
    return out;
  }
}

export function hits(colliders: Collider[], x: number, z: number, radius: number) {
  for (const c of colliders) {
    if (c.r !== undefined) {
      if (Math.hypot(x - c.x, z - c.z) < c.r + radius) return true;
    } else if (Math.abs(x - c.x) < c.hx! + radius && Math.abs(z - c.z) < c.hz! + radius) return true;
  }
  return false;
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() { return this.ids.length; }
  push(id: number, key: number) {
    this.ids.push(id); this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p); i = p;
    }
  }
  pop() {
    const top = this.ids[0];
    const lastId = this.ids.pop()!, lastKey = this.keys.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId; this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < this.ids.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.ids.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}
