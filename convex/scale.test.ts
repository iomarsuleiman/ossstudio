// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// Scale checks: every multiplayer function must stay inside Convex's
// per-transaction limits (documents/bytes read and written, index queries)
// with 5,000 visitors online, and the payloads clients receive must stay
// small. Limits are enforced here exactly as convex-test models production.
import { convexTest } from "convex-test";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { roomView } from "./frames.testutil";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { ROOM_IDS } from "./visitorAuth";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => { vi.useFakeTimers(); vi.stubEnv("GALLERY_CAPACITY", "10000"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
const VISITORS = 5000;

async function crowd(roomOf: (i: number) => string) {
  const t = convexTest({ schema, modules, transactionLimits: true });
  // Seed in batches that each fit in one transaction.
  for (let start = 0; start < VISITORS; start += 1000) {
    await t.run(async (ctx) => {
      for (let i = start; i < Math.min(VISITORS, start + 1000); i++) {
        const roomId = roomOf(i);
        const id = await ctx.db.insert("visitors", { token: `scale-token-${i}-abcdefghijk`, name: `Visitor ${i}`, color: "#86394a", allowDMs: true, online: true, roomId, lastActiveAt: Date.now() });
        await ctx.db.insert("presence", { visitorId: id, roomId, name: `Visitor ${i}`, color: "#86394a", open: true, x: (i % 9) - 4, z: (i % 40) - 20, yaw: 0, moving: i % 3 === 0, updatedAt: Date.now() });
      }
    });
  }
  await t.mutation(internal.presence.recount, {});
  return t;
}

describe(`with ${VISITORS} visitors online`, () => {
  it("spread over all rooms: counts, presence and payloads stay small", async () => {
    const t = await crowd((i) => ROOM_IDS[i % ROOM_IDS.length]);
    const counts = await t.query(api.presence.counts, {});
    expect(counts.total).toBe(VISITORS);
    const rows = await roomView(t, "art");
    expect(rows.length).toBeLessThanOrEqual(120);
    const frame = await t.query(api.presence.frame, { roomId: "art" });
    const perRow = JSON.stringify(frame).length / rows.length;
    console.log(`[scale] counts payload ${JSON.stringify(counts).length} B; room frame ${rows.length} people, ${JSON.stringify(frame).length} B (${perRow.toFixed(0)} B/person)`);
    expect(perRow).toBeLessThan(200);
    // Joining, moving, sitting and room changes are cheap single-row operations.
    const me = await t.mutation(api.presence.join, { token: "scale-token-me-abcdefghijklm", roomId: "art", x: 0, z: 0, yaw: 0 });
    expect(me.interval).toBe(1200); // a crowded room → the slowest send rate
    await t.mutation(api.presence.move, { token: "scale-token-me-abcdefghijklm", x: 1, z: 1, yaw: 1, moving: true });
    expect((await t.mutation(api.presence.sit, { token: "scale-token-me-abcdefghijklm", seat: "0:1" })).ok).toBe(true);
    await t.mutation(api.presence.changeRoom, { token: "scale-token-me-abcdefghijklm", roomId: "main", x: 0, z: 0, yaw: 0 });
  }, 120_000);

  it("everyone in one room: the room view is capped, and seats still resolve instantly", async () => {
    const t = await crowd(() => "main");
    const rows = await roomView(t, "main");
    expect(rows).toHaveLength(80); // a packed room's frame carries the 80 most recently active
    await t.mutation(api.presence.join, { token: "scale-token-me-abcdefghijklm", roomId: "main", x: 0, z: 0, yaw: 0 });
    expect((await t.mutation(api.presence.sit, { token: "scale-token-me-abcdefghijklm", seat: "1:2" })).ok).toBe(true);
  }, 120_000);

  it("a mass disconnect is swept in batches without hitting limits", async () => {
    const t = await crowd((i) => ROOM_IDS[i % ROOM_IDS.length]);
    for (let start = 0; start < VISITORS; start += 1000) {
      await t.run(async (ctx) => {
        const page = await ctx.db.query("presence").collect();
        for (const p of page.slice(start, start + 1000)) await ctx.db.patch(p._id, { updatedAt: 0 });
      });
    }
    let removed = 0, runs = 0;
    for (;;) {
      const r = await t.mutation(internal.presence.sweep, {});
      removed += r.removed; runs++;
      if (!r.removed) break;
    }
    expect(removed).toBe(VISITORS);
    expect((await t.query(api.presence.counts, {})).total).toBe(0);
    console.log(`[scale] swept ${removed} stale visitors in ${runs - 1} cron runs of ≤500`);
  }, 120_000);

  it("busy chat channels and long histories stay cheap to read", async () => {
    const t = await crowd((i) => ROOM_IDS[i % ROOM_IDS.length]);
    await t.run(async (ctx) => {
      const v = (await ctx.db.query("visitors").first())!;
      for (let i = 0; i < 3000; i++) await ctx.db.insert("messages", { channel: "gallery", visitorId: v._id, name: v.name, color: v.color, body: `message ${i} `.repeat(8) });
    });
    const page = await t.query(api.chat.list, { channel: "gallery", limit: 50 });
    expect(page.messages).toHaveLength(50);
    console.log(`[scale] chat page of 50: ${JSON.stringify(page).length} B`);
    const most = await t.query(api.chat.list, { channel: "gallery", limit: 200 });
    expect(most.more).toBe(true);
  }, 120_000);
});
