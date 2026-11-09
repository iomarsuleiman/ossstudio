// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { roomView } from "./frames.testutil";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
const token = (n: number) => `test-token-${n}-abcdefghijklmnop`;
const at = { x: 0, z: 0, yaw: 0 };

async function setup(n = 2, roomId = "art") {
  const t = convexTest(schema, modules);
  const people = [];
  for (let i = 0; i < n; i++) people.push(await t.mutation(api.presence.join, { token: token(i), roomId, ...at }));
  return { t, people };
}

describe("presence", () => {
  it("keeps ticking when a new visitor is still inside the snapshot lag", async () => {
    const { t } = await setup(1);
    await t.mutation(internal.presence.ensureTicker, {});
    const ticker = await t.query(internal.presence.tickerState, {});
    if (!ticker) throw new Error("Ticker did not start");
    const first = await t.action(internal.presence.tick, { gen: ticker.gen });
    expect(first.changed).toBe(0);
    const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.filter((job) => job.name === "presence:tick")).toHaveLength(2);
    vi.setSystemTime(Date.now() + 1000);
    await t.action(internal.presence.tick, { gen: ticker.gen, once: true });
    expect(JSON.parse((await t.query(api.presence.frame, { roomId: "art" })).data)).toHaveLength(1);
  });

  it("joins, counts and lists visitors per room", async () => {
    const { t, people } = await setup(3);
    expect(new Set(people.map((p) => p.visitorId)).size).toBe(3);
    expect(await t.query(api.presence.counts, {})).toEqual({ total: 3, rooms: { art: 3 } });
    expect(await roomView(t, "art")).toHaveLength(3);
    expect(await roomView(t, "main")).toHaveLength(0);
  });

  it("rejoining with the same token is the same visitor and doesn't double count", async () => {
    const { t, people } = await setup(1);
    const again = await t.mutation(api.presence.join, { token: token(0), roomId: "art", ...at });
    expect(again.visitorId).toBe(people[0].visitorId);
    expect((await t.query(api.presence.counts, {})).total).toBe(1);
  });

  it("moves between rooms and keeps counts right", async () => {
    const { t } = await setup(2);
    await t.mutation(api.presence.changeRoom, { token: token(0), roomId: "main", ...at });
    expect(await t.query(api.presence.counts, {})).toEqual({ total: 2, rooms: { art: 1, main: 1 } });
    await t.mutation(api.presence.leave, { token: token(1) });
    expect(await t.query(api.presence.counts, {})).toEqual({ total: 1, rooms: { art: 0, main: 1 } });
  });

  it("records movement compactly", async () => {
    const { t } = await setup(1);
    await t.mutation(api.presence.move, { token: token(0), x: 1.23456, z: -2.5, yaw: 0.5, moving: true });
    const [p] = await roomView(t, "art");
    expect(p).toMatchObject({ x: 1.23, z: -2.5, y: 0.5, m: true, s: null });
  });

  it("never seats two visitors on the same seat", async () => {
    const { t } = await setup(3);
    expect(await t.mutation(api.presence.sit, { token: token(0), seat: "0:1" })).toEqual({ ok: true });
    expect(await t.mutation(api.presence.sit, { token: token(1), seat: "0:1" })).toEqual({ ok: false });
    // Shared bench: the next seat is free.
    expect(await t.mutation(api.presence.sit, { token: token(1), seat: "0:2" })).toEqual({ ok: true });
    await t.mutation(api.presence.sit, { token: token(0), seat: null });
    expect(await t.mutation(api.presence.sit, { token: token(2), seat: "0:1" })).toEqual({ ok: true });
  });

  it("sweeps visitors who went quiet and repairs counters", async () => {
    const { t } = await setup(2);
    await t.run(async (ctx) => {
      for (const p of await ctx.db.query("presence").collect()) await ctx.db.patch(p._id, { updatedAt: Date.now() - 120_000 });
    });
    const r = await t.mutation(internal.presence.sweep, {});
    expect(r.removed).toBe(2);
    expect((await t.query(api.presence.counts, {})).total).toBe(0);
    // Drift is repaired by recount.
    await t.mutation(api.presence.join, { token: token(5), roomId: "ai", ...at });
    await t.run(async (ctx) => { await ctx.db.insert("roomCounts", { roomId: "ai", shard: 3, count: 7 }); });
    await t.mutation(internal.presence.recount, {});
    expect((await t.query(api.presence.counts, {})).rooms.ai).toBe(1);
  });

  it("recommends slower updates in crowded rooms", async () => {
    const { people } = await setup(30);
    expect(people[0].interval).toBe(200);
    expect(people[29].interval).toBeGreaterThan(200);
  });

  it("rejects unknown tokens and rooms", async () => {
    const { t } = await setup(1);
    await expect(t.mutation(api.presence.move, { token: "nobody-nobody-nobody-xx", ...at, moving: false })).rejects.toThrow();
    await expect(t.mutation(api.presence.join, { token: token(9), roomId: "attic", ...at })).rejects.toThrow();
  });
});

describe("room frames (the ticker)", () => {
  it("adds arrivals, removes departures and follows room changes", async () => {
    const { t } = await setup(3);
    expect(await roomView(t, "art")).toHaveLength(3);
    await t.mutation(api.presence.leave, { token: token(0) });
    await t.mutation(api.presence.changeRoom, { token: token(1), roomId: "ai", ...at });
    expect((await roomView(t, "art")).map((r) => r.id)).toHaveLength(1);
    expect(await roomView(t, "ai")).toHaveLength(1);
  });

  it("only rewrites a frame when something in that room changed", async () => {
    const { t } = await setup(2);
    await roomView(t, "art");
    const before = await t.query(api.presence.frame, { roomId: "art" });
    await t.mutation(api.presence.join, { token: token(9), roomId: "ai", ...at });
    await roomView(t, "ai");
    expect((await t.query(api.presence.frame, { roomId: "art" })).at).toBe(before.at);
    await t.mutation(api.presence.move, { token: token(0), x: 3, z: 3, yaw: 0, moving: true });
    await roomView(t, "art");
    expect((await t.query(api.presence.frame, { roomId: "art" })).at).toBeGreaterThan(before.at);
  });

  it("runs a single ticker loop", async () => {
    const t = convexTest(schema, modules);
    expect(await t.mutation(internal.presence.ensureTicker, {})).toMatchObject({ started: true, gen: 1 });
    expect(await t.mutation(internal.presence.ensureTicker, {})).toMatchObject({ started: false });
    // A superseded loop stops itself.
    vi.setSystemTime(Date.now() + 10_000);
    expect(await t.mutation(internal.presence.ensureTicker, {})).toMatchObject({ started: true, gen: 2 });
    expect(await t.action(internal.presence.tick, { gen: 1, once: true })).toEqual({ stopped: true });
    expect((await t.action(internal.presence.tick, { gen: 2, once: true })).stopped).toBe(false);
  });
});

describe("chat", () => {
  it("keeps room and gallery conversations separate and persistent", async () => {
    const { t } = await setup(2);
    await t.mutation(api.chat.send, { token: token(0), channel: "room:art", body: "  Look at this one  " });
    await t.mutation(api.chat.send, { token: token(1), channel: "gallery", body: "Hello everyone" });
    await t.mutation(api.presence.leave, { token: token(0) });
    const room = await t.query(api.chat.list, { channel: "room:art" });
    expect(room.messages.map((m) => m.body)).toEqual(["Look at this one"]);
    const gallery = await t.query(api.chat.list, { channel: "gallery" });
    expect(gallery.messages.map((m) => m.body)).toEqual(["Hello everyone"]);
  });

  it("rate limits, strips control characters and caps length", async () => {
    const { t } = await setup(1);
    await t.mutation(api.chat.send, { token: token(0), channel: "gallery", body: "a‮b" + "x".repeat(900) });
    await expect(t.mutation(api.chat.send, { token: token(0), channel: "gallery", body: "too fast" })).rejects.toThrow(/Slow down/);
    const { messages } = await t.query(api.chat.list, { channel: "gallery" });
    expect(messages[0].body.startsWith("ab")).toBe(true);
    expect(messages[0].body.length).toBe(500);
  });

  it("refuses unknown channels and empty messages", async () => {
    const { t } = await setup(1);
    await expect(t.mutation(api.chat.send, { token: token(0), channel: "room:attic", body: "hi" })).rejects.toThrow();
    await expect(t.mutation(api.chat.send, { token: token(0), channel: "gallery", body: "   " })).rejects.toThrow();
  });

  it("pages back through history", async () => {
    const { t } = await setup(1);
    await t.run(async (ctx) => {
      const v = (await ctx.db.query("visitors").first())!;
      for (let i = 0; i < 70; i++) await ctx.db.insert("messages", { channel: "gallery", visitorId: v._id, name: v.name, color: v.color, body: `m${i}` });
    });
    const first = await t.query(api.chat.list, { channel: "gallery", limit: 50 });
    expect(first.more).toBe(true);
    expect(first.messages[49].body).toBe("m69");
    const all = await t.query(api.chat.list, { channel: "gallery", limit: 100 });
    expect(all.more).toBe(false);
    expect(all.messages).toHaveLength(70);
  });

  it("shows and clears typing indicators", async () => {
    const { t } = await setup(1);
    await t.mutation(api.chat.setTyping, { token: token(0), channel: "room:art", typing: true });
    expect(await t.query(api.chat.whoIsTyping, { channel: "room:art" })).toHaveLength(1);
    await t.mutation(api.chat.send, { token: token(0), channel: "room:art", body: "done" });
    expect(await t.query(api.chat.whoIsTyping, { channel: "room:art" })).toHaveLength(0);
  });
});

describe("private messages", () => {
  it("delivers, tracks unread and keeps history after leaving", async () => {
    const { t, people } = await setup(2);
    const [a, b] = people;
    const r = await t.mutation(api.dms.send, { token: token(0), to: b.visitorId, body: "Hi!" });
    expect(r.ok).toBe(true);
    let convs = await t.query(api.dms.conversations, { token: token(1) });
    expect(convs).toHaveLength(1);
    expect(convs[0]).toMatchObject({ with: a.visitorId, unread: 1, online: true, lastBody: "Hi!" });
    await t.mutation(api.presence.leave, { token: token(0) });
    convs = await t.query(api.dms.conversations, { token: token(1) });
    expect(convs[0].online).toBe(false);
    if (!r.ok) throw new Error();
    await t.mutation(api.dms.markRead, { token: token(1), conversationId: r.conversationId });
    expect((await t.query(api.dms.conversations, { token: token(1) }))[0].unread).toBe(0);
    const thread = await t.query(api.dms.thread, { token: token(0), conversationId: r.conversationId });
    expect(thread!.messages.map((m) => [m.mine, m.body])).toEqual([[true, "Hi!"]]);
    expect(thread!.otherReadAt).toBeGreaterThan(0);
  });

  it("keeps conversations private", async () => {
    const { t, people } = await setup(3);
    const r = await t.mutation(api.dms.send, { token: token(0), to: people[1].visitorId, body: "secret" });
    if (!r.ok) throw new Error();
    expect(await t.query(api.dms.thread, { token: token(2), conversationId: r.conversationId })).toBeNull();
    await expect(t.mutation(api.dms.markRead, { token: token(2), conversationId: r.conversationId })).rejects.toThrow();
    await expect(t.mutation(api.chat.setTyping, { token: token(2), channel: `dm:${r.conversationId}`, typing: true })).rejects.toThrow();
  });

  it("respects blocks in both directions", async () => {
    const { t, people } = await setup(2);
    await t.mutation(api.dms.block, { token: token(1), visitorId: people[0].visitorId });
    expect(await t.mutation(api.dms.send, { token: token(0), to: people[1].visitorId, body: "hello?" })).toEqual({ ok: false, reason: "unavailable" });
    expect(await t.mutation(api.dms.send, { token: token(1), to: people[0].visitorId, body: "hi" })).toEqual({ ok: false, reason: "blocked" });
    expect(await t.query(api.dms.myBlocks, { token: token(1) })).toHaveLength(1);
    await t.mutation(api.dms.unblock, { token: token(1), visitorId: people[0].visitorId });
    expect((await t.mutation(api.dms.send, { token: token(0), to: people[1].visitorId, body: "hello" })).ok).toBe(true);
  });

  it("lets visitors turn off new private messages", async () => {
    const { t, people } = await setup(2);
    await t.mutation(api.presence.setProfile, { token: token(1), allowDMs: false });
    expect(await t.mutation(api.dms.send, { token: token(0), to: people[1].visitorId, body: "hey" })).toEqual({ ok: false, reason: "closed" });
    const w = await t.query(api.dms.conversationWith, { token: token(0), other: people[1].visitorId });
    expect(w).toMatchObject({ acceptsNew: false, conversationId: null });
  });

  it("renames visitors everywhere they show", async () => {
    const { t } = await setup(1);
    await t.mutation(api.presence.setProfile, { token: token(0), name: "  Mona   Lisa  " });
    const [p] = await roomView(t, "art");
    expect(p.n).toBe("Mona Lisa");
    await expect(t.mutation(api.presence.setProfile, { token: token(0), name: " " })).rejects.toThrow();
  });
});
