import { describe, expect, it } from "vitest";
import { buildBundledContent } from "@/content";
import { INTRO_PANEL_INSET, seatPose } from "@/content/layout";

describe("gallery bench clearance", () => {
  it("keeps benches and their standing spots clear of entrance panels in every room", () => {
    const content = buildBundledContent();
    for (const shape of content.shapes.filter((s) => s.roomId !== "main")) {
      const panelX = -shape.width / 2 + 2;
      const panelZ = shape.length / 2 - INTRO_PANEL_INSET;
      for (const bench of shape.benches) {
        // The panel is 3 m wide and rotated 0.55 rad. Include bevels,
        // the bench's 2.3 m hit area and clearance for a standing visitor.
        expect(Math.abs(bench.x - panelX) > 2 || Math.abs(bench.z - panelZ) >= 2.5).toBe(true);
        for (let seat = 0; seat < 3; seat++) {
          const pose = seatPose(bench, seat);
          expect(Math.abs(pose.standX - panelX) > 1.8 || Math.abs(pose.standZ - panelZ) > 1.3).toBe(true);
        }
      }
    }
  });

  it("provides back-to-back seating for every artwork bay in every gallery", () => {
    const content = buildBundledContent();
    for (const shape of content.shapes) {
      if (shape.roomId === "main") {
        expect(shape.benches).toHaveLength(4);
        continue;
      }
      const bays = new Set(content.exhibits.filter((e) => e.roomId === shape.roomId).map((e) => e.z));
      expect(shape.benches).toHaveLength(bays.size * 2);
      for (const z of bays) {
        expect(shape.benches.filter((b) => b.z === z)).toEqual([
          { x: -0.32, z, rotY: -Math.PI / 2 },
          { x: 0.32, z, rotY: Math.PI / 2 },
        ]);
      }
    }
  });
});
