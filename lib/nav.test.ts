import { describe, expect, it } from "vitest";
import { NavGrid, hits } from "./nav";

const R = 0.35;

describe("NavGrid", () => {
  it("walks straight when nothing is in the way", () => {
    const g = new NavGrid(9, 30, [], R);
    const p = g.path({ x: 0, z: 10 }, { x: 0, z: -10 })!;
    expect(p).toHaveLength(1);
    expect(p[0].z).toBeCloseTo(-10, 0);
  });

  it("goes around a bench instead of through it", () => {
    const bench = { x: 0, z: 0, hx: 1.05, hz: 0.25 };
    const g = new NavGrid(9, 30, [bench], R);
    const p = g.path({ x: 0, z: 4 }, { x: 0, z: -4 })!;
    expect(p.length).toBeGreaterThan(1);
    // Sample the whole route: it never enters the bench.
    let from = { x: 0, z: 4 };
    for (const q of p) {
      for (let t = 0; t <= 1; t += 0.02) {
        expect(hits([bench], from.x + (q.x - from.x) * t, from.z + (q.z - from.z) * t, R)).toBe(false);
      }
      from = q;
    }
    expect(p[p.length - 1].z).toBeCloseTo(-4, 0);
  });

  it("snaps a click on an obstacle to the nearest reachable spot", () => {
    const g = new NavGrid(9, 30, [{ x: 0, z: 0, r: 1 }], R);
    const p = g.path({ x: 0, z: 6 }, { x: 0, z: 0 })!;
    const end = p[p.length - 1];
    expect(Math.hypot(end.x, end.z)).toBeGreaterThanOrEqual(1 + R);
    expect(Math.hypot(end.x, end.z)).toBeLessThan(1 + R + 0.5);
  });

  it("clamps clicks beyond the walkway edge", () => {
    const g = new NavGrid(9, 30, [], R);
    const p = g.path({ x: 0, z: 0 }, { x: 20, z: 0 })!;
    expect(p[p.length - 1].x).toBeLessThanOrEqual(4.5 - R + 1e-6);
  });

  it("finds a way around a wall with a gap", () => {
    // A wall across the room with a gap on the far right.
    const wall = [{ x: -1, z: 0, hx: 3.6, hz: 0.2 }];
    const g = new NavGrid(9, 20, wall, R);
    const p = g.path({ x: -3, z: 5 }, { x: -3, z: -5 })!;
    expect(p).not.toBeNull();
    expect(Math.max(...p.map((q) => q.x))).toBeGreaterThan(2.5);
  });
});
