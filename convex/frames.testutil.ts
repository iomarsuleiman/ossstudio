// Test helper (not a Convex function module): run one ticker pass and read a
// room's frame the way the client does. Tests use fake timers so the real
// self-scheduling ticker loop never starts on its own.
import { vi } from "vitest";
import type { TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import type schema from "./schema";
import type { FrameRow } from "./visitorAuth";

const GEN = 4242;

export async function roomView(t: TestConvex<typeof schema>, roomId: string) {
  vi.setSystemTime(Date.now() + 1000); // past the ticker's 250 ms safety lag
  await t.run(async (ctx) => {
    const tk = await ctx.db.query("ticker").first();
    if (!tk) await ctx.db.insert("ticker", { gen: GEN, lastTick: 0, aliveAt: Date.now() });
    else if (tk.gen !== GEN) await ctx.db.patch(tk._id, { gen: GEN });
  });
  await t.action(internal.presence.tick, { gen: GEN, once: true });
  const f = await t.query(api.presence.frame, { roomId });
  return (JSON.parse(f.data) as FrameRow[]).map(([id, n, c, x, z, y, m, s, ts, o]) => ({ id, n, c, x, z, y, m: !!m, s, t: ts, o: !!o }));
}
