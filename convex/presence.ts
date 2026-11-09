import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  COUNT_SHARDS, PRESENCE_TTL_MS, TICK_LAG_MS, addToCount, cleanName, frameCapFor, isRoom, requireVisitor, sendIntervalFor, tickIntervalFor, visitorByToken,
  type FrameRow,
} from "./visitorAuth";

// Live presence: who is in the gallery, which room they're in, where they
// stand and which seat they're on.
//
// Writes and reads are decoupled. Movement only patches the visitor's own
// `presence` row, which nobody subscribes to. A single ticker (an action, so
// its reads never conflict with movement writes) folds the changes into one
// compact `roomFrames` document per room every 0.5–1 s, and clients
// subscribe to that. A room's traffic is therefore frames/s × viewers ×
// frame size, however often people move.

const pose = { x: v.number(), z: v.number(), yaw: v.number() };
const COLORS = ["#86394a", "#3f6f8e", "#6b8e3f", "#b0703a", "#7a4f9a", "#3a8a7a", "#a8485f", "#5a6fb0", "#8a7a3a", "#c06a8a"];
const ADJ = ["Quiet", "Curious", "Gentle", "Bright", "Calm", "Wandering", "Kind", "Patient", "Hopeful", "Merry"];
const NOUN = ["Heron", "Fern", "Lantern", "Pebble", "Sparrow", "Willow", "Comet", "Harbor", "Maple", "Otter"];

const r2 = (n: number) => Math.round(n * 100) / 100;

async function departed(ctx: MutationCtx, roomId: string, visitorId: Id<"visitors">) {
  await ctx.db.insert("departures", { roomId, visitorId, at: Date.now() });
}

async function roomCount(ctx: MutationCtx, roomId: string) {
  let n = 0;
  for (let shard = 0; shard < COUNT_SHARDS; shard++) {
    const d = await ctx.db.query("roomCounts").withIndex("by_room_shard", (q) => q.eq("roomId", roomId).eq("shard", shard)).unique();
    n += d?.count ?? 0;
  }
  return Math.max(0, n);
}

/** Arrive (or come back): creates the visitor on first visit. Returns who you are and how often to send movement. */
export const join = mutation({
  args: { token: v.string(), roomId: v.string(), name: v.optional(v.string()), ...pose },
  handler: async (ctx, { token, roomId, name, x, z, yaw }) => {
    if (token.length < 20 || token.length > 128) throw new Error("Bad token");
    if (!isRoom(roomId)) throw new Error("Unknown room");
    const now = Date.now();
    let visitor = await visitorByToken(ctx, token);
    if (!visitor) {
      const id = await ctx.db.insert("visitors", {
        token,
        name: (name && cleanName(name)) || `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${NOUN[Math.floor(Math.random() * NOUN.length)]}`,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        allowDMs: true,
        online: true,
        roomId,
        lastActiveAt: now,
      });
      visitor = (await ctx.db.get(id))!;
    } else {
      await ctx.db.patch(visitor._id, { online: true, roomId, lastActiveAt: now });
    }
    const existing = await ctx.db.query("presence").withIndex("by_visitor", (q) => q.eq("visitorId", visitor._id)).unique();
    if (existing) {
      if (existing.roomId !== roomId) {
        await addToCount(ctx, existing.roomId, -1);
        await addToCount(ctx, roomId, 1);
        await departed(ctx, existing.roomId, visitor._id);
      }
      await ctx.db.patch(existing._id, { roomId, x: r2(x), z: r2(z), yaw: r2(yaw), moving: false, seat: undefined, updatedAt: now, name: visitor.name, color: visitor.color, open: visitor.allowDMs });
    } else {
      await ctx.db.insert("presence", { visitorId: visitor._id, roomId, name: visitor.name, color: visitor.color, open: visitor.allowDMs, x: r2(x), z: r2(z), yaw: r2(yaw), moving: false, updatedAt: now });
      await addToCount(ctx, roomId, 1);
    }
    // Make sure the ticker that builds room frames is running.
    await ctx.scheduler.runAfter(0, internal.presence.ensureTicker, {});
    return {
      visitorId: visitor._id,
      name: visitor.name,
      color: visitor.color,
      allowDMs: visitor.allowDMs,
      interval: sendIntervalFor(await roomCount(ctx, roomId)),
    };
  },
});

async function myPresence(ctx: MutationCtx, token: string) {
  const visitor = await requireVisitor(ctx, token);
  const p = await ctx.db.query("presence").withIndex("by_visitor", (q) => q.eq("visitorId", visitor._id)).unique();
  return { visitor, p };
}

/** Movement (and the heartbeat while standing still). Two reads, one write. */
export const move = mutation({
  args: { token: v.string(), moving: v.boolean(), ...pose },
  handler: async (ctx, { token, x, z, yaw, moving }) => {
    const { p } = await myPresence(ctx, token);
    if (!p) return { rejoin: true };
    await ctx.db.patch(p._id, { x: r2(x), z: r2(z), yaw: r2(yaw), moving, updatedAt: Date.now() });
    return { rejoin: false };
  },
});

export const changeRoom = mutation({
  args: { token: v.string(), roomId: v.string(), ...pose },
  handler: async (ctx, { token, roomId, x, z, yaw }) => {
    if (!isRoom(roomId)) throw new Error("Unknown room");
    const { visitor, p } = await myPresence(ctx, token);
    const now = Date.now();
    await ctx.db.patch(visitor._id, { roomId, online: true, lastActiveAt: now });
    if (p) {
      if (p.roomId !== roomId) {
        await addToCount(ctx, p.roomId, -1);
        await addToCount(ctx, roomId, 1);
        await departed(ctx, p.roomId, visitor._id);
      }
      await ctx.db.patch(p._id, { roomId, x: r2(x), z: r2(z), yaw: r2(yaw), moving: false, seat: undefined, updatedAt: now });
    } else {
      await ctx.db.insert("presence", { visitorId: visitor._id, roomId, name: visitor.name, color: visitor.color, open: visitor.allowDMs, x: r2(x), z: r2(z), yaw: r2(yaw), moving: false, updatedAt: now });
      await addToCount(ctx, roomId, 1);
    }
    return { interval: sendIntervalFor(await roomCount(ctx, roomId)) };
  },
});

/**
 * Take a seat ("bench:seat") or stand up (null). Runs as one transaction, so
 * two visitors can never end up on the same seat; the second one is refused.
 */
export const sit = mutation({
  args: { token: v.string(), seat: v.union(v.string(), v.null()) },
  handler: async (ctx, { token, seat }) => {
    const { p } = await myPresence(ctx, token);
    if (!p) return { ok: false };
    if (seat === null) {
      await ctx.db.patch(p._id, { seat: undefined, updatedAt: Date.now() });
      return { ok: true };
    }
    if (!/^\d{1,2}:\d$/.test(seat)) throw new Error("Bad seat");
    const holder = await ctx.db.query("presence").withIndex("by_room_seat", (q) => q.eq("roomId", p.roomId).eq("seat", seat)).first();
    if (holder && holder._id !== p._id) return { ok: false };
    await ctx.db.patch(p._id, { seat, moving: false, updatedAt: Date.now() });
    return { ok: true };
  },
});

export const leave = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const visitor = await visitorByToken(ctx, token);
    if (!visitor) return;
    await removePresence(ctx, visitor);
  },
});

async function removePresence(ctx: MutationCtx, visitor: Doc<"visitors">) {
  const p = await ctx.db.query("presence").withIndex("by_visitor", (q) => q.eq("visitorId", visitor._id)).unique();
  if (p) {
    await ctx.db.delete(p._id);
    await addToCount(ctx, p.roomId, -1);
    await departed(ctx, p.roomId, visitor._id);
  }
  for (const t of await ctx.db.query("typing").withIndex("by_visitor", (q) => q.eq("visitorId", visitor._id)).collect()) await ctx.db.delete(t._id);
  await ctx.db.patch(visitor._id, { online: false, lastActiveAt: Date.now() });
}

export const setProfile = mutation({
  args: { token: v.string(), name: v.optional(v.string()), allowDMs: v.optional(v.boolean()) },
  handler: async (ctx, { token, name, allowDMs }) => {
    const { visitor, p } = await myPresence(ctx, token);
    const patch: Partial<Doc<"visitors">> = {};
    if (name !== undefined) {
      const clean = cleanName(name);
      if (clean.length < 2) throw new Error("Name too short");
      patch.name = clean;
    }
    if (allowDMs !== undefined) patch.allowDMs = allowDMs;
    await ctx.db.patch(visitor._id, patch);
    if (p && (patch.name || patch.allowDMs !== undefined)) await ctx.db.patch(p._id, { name: patch.name ?? p.name, open: patch.allowDMs ?? p.open, updatedAt: Date.now() });
    return { name: patch.name ?? visitor.name, allowDMs: patch.allowDMs ?? visitor.allowDMs };
  },
});

/**
 * Everyone in a room, as the ticker's latest compact frame (a JSON string the
 * client parses). Changes at most once per tick, however busy the room is.
 */
export const frame = query({
  args: { roomId: v.string() },
  handler: async (ctx, { roomId }) => {
    const f = await ctx.db.query("roomFrames").withIndex("by_room", (q) => q.eq("roomId", roomId)).unique();
    return f ? { at: f.at, data: f.data } : { at: 0, data: "[]" };
  },
});

/** Head counts for the whole gallery and each room (reads only the small counters table). */
export const counts = query({
  args: {},
  handler: async (ctx) => {
    const rooms: Record<string, number> = {};
    for (const d of await ctx.db.query("roomCounts").collect()) rooms[d.roomId] = (rooms[d.roomId] ?? 0) + d.count;
    let total = 0;
    for (const k of Object.keys(rooms)) { rooms[k] = Math.max(0, rooms[k]); total += rooms[k]; }
    return { total, rooms };
  },
});

/** Removes visitors whose tab closed without saying goodbye. Runs every 30 s (see crons.ts). */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    const stale = await ctx.db.query("presence").withIndex("by_updated", (q) => q.lt("updatedAt", cutoff)).take(500);
    for (const p of stale) {
      await ctx.db.delete(p._id);
      await addToCount(ctx, p.roomId, -1);
      await departed(ctx, p.roomId, p.visitorId);
      const visitor = await ctx.db.get(p.visitorId);
      if (visitor) await ctx.db.patch(visitor._id, { online: false });
    }
    const oldTyping = await ctx.db.query("typing").withIndex("by_expires", (q) => q.lt("expiresAt", Date.now())).take(500);
    for (const t of oldTyping) await ctx.db.delete(t._id);
    const oldDepartures = await ctx.db.query("departures").withIndex("by_at", (q) => q.lt("at", Date.now() - 120_000)).take(1000);
    for (const d of oldDepartures) await ctx.db.delete(d._id);
    return { removed: stale.length, typing: oldTyping.length };
  },
});

/** Rebuilds the head counters from presence (repairs any drift). Runs every 10 minutes. */
export const recount = internalMutation({
  args: {},
  handler: async (ctx) => {
    const totals: Record<string, number> = {};
    for await (const p of ctx.db.query("presence")) totals[p.roomId] = (totals[p.roomId] ?? 0) + 1;
    for (const d of await ctx.db.query("roomCounts").collect()) await ctx.db.delete(d._id);
    for (const [roomId, count] of Object.entries(totals)) await ctx.db.insert("roomCounts", { roomId, shard: 0, count });
    return totals;
  },
});

// --- The ticker -------------------------------------------------------------------------
// One loop for the whole deployment: tick (action) → read changes (query, no
// write conflicts) → fold them into room frames (mutation that touches only
// frames and the ticker doc) → schedule the next tick. `gen` guarantees a
// single loop; ensureTicker restarts it if it ever stops.

export const ensureTicker = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const t = await ctx.db.query("ticker").first();
    if (t && now - t.aliveAt < 3000) return { started: false };
    const gen = (t?.gen ?? 0) + 1;
    if (t) await ctx.db.patch(t._id, { gen, aliveAt: now });
    // A brand-new ticker looks back over the whole presence window so nobody is missed.
    else await ctx.db.insert("ticker", { gen, lastTick: now - PRESENCE_TTL_MS, aliveAt: now });
    await ctx.scheduler.runAfter(0, internal.presence.tick, { gen });
    return { started: true, gen };
  },
});

export const tickerState = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("ticker").first(),
});

/** Presence rows and departures in [since, until): a snapshot read that never conflicts with writers. */
export const changes = internalQuery({
  args: { since: v.number(), until: v.number() },
  handler: async (ctx, { since, until }) => {
    const moved = await ctx.db.query("presence").withIndex("by_updated", (q) => q.gte("updatedAt", since).lt("updatedAt", until)).take(8000);
    const left = await ctx.db.query("departures").withIndex("by_at", (q) => q.gte("at", since).lt("at", until)).take(8000);
    return {
      rows: moved.map((p) => ({ roomId: p.roomId, row: [p.visitorId, p.name, p.color, p.x, p.z, p.yaw, p.moving ? 1 : 0, p.seat ?? null, p.updatedAt, p.open === false ? 0 : 1] as FrameRow })),
      left: left.map((d) => ({ roomId: d.roomId, id: d.visitorId as string })),
      truncated: moved.length === 8000 || left.length === 8000,
    };
  },
});

const frameRow = v.array(v.any());
type Changes = { rows: { roomId: string; row: FrameRow }[]; left: { roomId: string; id: string }[]; truncated: boolean };

/** Fold changes into the room frames. Only this ticker writes frames, so it never conflicts. */
export const writeFrames = internalMutation({
  args: {
    gen: v.number(),
    until: v.number(),
    rows: v.array(v.object({ roomId: v.string(), row: frameRow })),
    left: v.array(v.object({ roomId: v.string(), id: v.string() })),
  },
  handler: async (ctx, { gen, until, rows, left }) => {
    const ticker = await ctx.db.query("ticker").first();
    if (!ticker || ticker.gen !== gen) return { stop: true, online: 0, interval: 1000 };
    const now = Date.now();
    const byRoom = new Map<string, { rows: FrameRow[]; left: Set<string> }>();
    const touch = (roomId: string) => {
      let e = byRoom.get(roomId);
      if (!e) byRoom.set(roomId, (e = { rows: [], left: new Set() }));
      return e;
    };
    for (const r of rows) touch(r.roomId).rows.push(r.row as FrameRow);
    for (const d of left) touch(d.roomId).left.add(d.id);

    let online = 0;
    const frames = await ctx.db.query("roomFrames").collect();
    const known = new Map(frames.map((f) => [f.roomId, f]));
    for (const f of frames) if (!byRoom.has(f.roomId)) online += f.count;
    for (const [roomId, change] of byRoom) {
      const f = known.get(roomId);
      const current = new Map<string, FrameRow>((f ? (JSON.parse(f.data) as FrameRow[]) : []).map((r) => [r[0], r]));
      for (const id of change.left) current.delete(id);
      for (const r of change.rows) {
        const prev = current.get(r[0]);
        if (!prev || prev[8] <= r[8]) current.set(r[0], r);
      }
      // Drop anyone the sweep hasn't caught yet, then keep the most recently active.
      const list = [...current.values()].filter((r) => now - r[8] < PRESENCE_TTL_MS).sort((a, b) => b[8] - a[8]);
      const capped = list.slice(0, frameCapFor(list.length));
      const data = JSON.stringify(capped);
      online += list.length;
      if (f) { if (f.data !== data) await ctx.db.patch(f._id, { data, count: list.length, at: now }); }
      else await ctx.db.insert("roomFrames", { roomId, data, count: list.length, at: now });
    }
    await ctx.db.patch(ticker._id, { lastTick: until, aliveAt: now });
    return { stop: false, online, interval: tickIntervalFor(online) };
  },
});

export const tick = internalAction({
  args: { gen: v.number(), once: v.optional(v.boolean()) },
  handler: async (ctx, { gen, once }): Promise<{ stopped: boolean; online?: number; changed?: number; left?: number }> => {
    const ticker: Doc<"ticker"> | null = await ctx.runQuery(internal.presence.tickerState, {});
    if (!ticker || ticker.gen !== gen) return { stopped: true };
    const until = Date.now() - TICK_LAG_MS;
    const since = Math.min(ticker.lastTick, until);
    const ch: Changes = await ctx.runQuery(internal.presence.changes, { since, until });
    // Very large backlogs are folded over several ticks.
    const upTo: number = ch.truncated ? Math.max(...ch.rows.map((r) => r.row[8]), since + 1) : until;
    const r: { stop: boolean; online: number; interval: number } = await ctx.runMutation(internal.presence.writeFrames, { gen, until: upTo, rows: ch.rows, left: ch.left });
    if (r.stop) return { stopped: true };
    // Keep ticking while anyone is around; join() restarts the loop otherwise.
    if (!once && (r.online > 0 || ch.rows.length || ch.left.length)) await ctx.scheduler.runAfter(r.interval, internal.presence.tick, { gen });
    return { stopped: false, online: r.online, changed: ch.rows.length, left: ch.left.length };
  },
});
