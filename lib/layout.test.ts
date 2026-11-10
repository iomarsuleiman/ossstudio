import { describe, expect, it } from "vitest";
import { buildBundledContent } from "@/content";
import { FRAME_SPACING, INTRO_PANEL_INSET, seatPose } from "@/content/layout";
import { NavGrid } from "./nav";

describe("museum layout", () => {
  const content = buildBundledContent();

  it("keeps art on each wall generously spaced", () => {
    expect(FRAME_SPACING).toBeGreaterThanOrEqual(7);
    for (const shape of content.shapes.filter((s) => s.roomId !== "main")) {
      expect(shape.width).toBeGreaterThanOrEqual(14);
      const frames = content.exhibits.filter((e) => e.roomId === shape.roomId && e.kind === "frame");
      for (const side of [-1, 1]) {
        const zs = frames.filter((e) => Math.sign(e.x) === side).map((e) => e.z).sort((a, b) => a - b);
        for (let i = 1; i < zs.length; i++) {
          expect(zs[i] - zs[i - 1]).toBeGreaterThanOrEqual(FRAME_SPACING - 0.01);
        }
      }
    }
  });

  it("keeps benches and standing spots clear of entrance panels", () => {
    for (const shape of content.shapes.filter((s) => s.roomId !== "main")) {
      const panelX = -shape.width / 2 + 2;
      const panelZ = shape.length / 2 - INTRO_PANEL_INSET;
      for (const bench of shape.benches) {
        expect(Math.abs(bench.x - panelX) > 2 || Math.abs(bench.z - panelZ) >= 2.5).toBe(true);
        for (let seat = 0; seat < 3; seat++) {
          const pose = seatPose(bench, seat);
          expect(Math.abs(pose.standX - panelX) > 1.8 || Math.abs(pose.standZ - panelZ) > 1.3).toBe(true);
        }
      }
    }
  });

  it("uses occasional seating bays, leaving the main route clear", () => {
    for (const shape of content.shapes) {
      if (shape.roomId === "main") {
        expect(shape.benches).toHaveLength(4);
        continue;
      }
      const bays = new Set(content.exhibits.filter((e) => e.roomId === shape.roomId).map((e) => e.z));
      expect(shape.benches.length).toBeLessThanOrEqual(Math.ceil(bays.size / 3));
      for (const bench of shape.benches) {
        expect(Math.abs(bench.x)).toBeGreaterThanOrEqual(2);
        expect(bays.has(bench.z)).toBe(false);
      }
    }
  });

  it("leaves broad aisles around internal walls and a traversable route", () => {
    for (const shape of content.shapes.filter((s) => s.roomId !== "main")) {
      const partitions = shape.partitions ?? [];
      const grid = new NavGrid(shape.width, shape.length, [
        ...partitions,
        ...shape.benches.map((b) => ({ x: b.x, z: b.z, hx: 0.3, hz: 1.1 })),
      ], 0.35);
      for (const p of partitions) {
        expect(shape.width / 2 - (Math.abs(p.x) + p.hx)).toBeGreaterThanOrEqual(0);
        expect(shape.width / 2 - (-Math.abs(p.x) + p.hx)).toBeGreaterThan(4.5);
      }
      const start = { x: 0, z: shape.length / 2 - 3.5 };
      const end = { x: 0, z: -shape.length / 2 + 3.5 };
      expect(grid.path(start, end)).not.toBeNull();
    }
  });
});
