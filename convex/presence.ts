import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  COUNT_SHARDS, PRESENCE_TTL_MS, addToCount, cleanName, isRoom, requireVisitor, sendIntervalFor, visitorByToken,
} from "./visitorAuth";

// Live presence: who is in the gallery, which room they're in, where they
// stand and which seat they're on. Movement writes touch only the visitor's
// own `presence` row, so a step in one room never re-runs another room's
// subscriptions or the head counts.

const pose = { x: v.number(), z: v.number(), yaw: v.number() };
const COLORS = ["#86394a", "#3f6f8e", "#6b8e3f", "#b0703a", "#7a4f9a", "#3a8a7a", "#a8485f", "#5a6fb0", "#8a7a3a", "#c06a8a"];
const ADJ = ["Quiet", "Curious", "Gentle", "Bright", "Calm", "Wandering", "Kind", "Patient", "Hopeful", "Merry"];
const NOUN = ["Heron", "Fern", "Lantern", "Pebble", "Sparrow", "Willow", "Comet", "Harbor", "Maple", "Otter"];

const r2 = (n: number) => Math.round(n * 100) / 100;

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
      }
      await ctx.db.patch(existing._id, { roomId, x: r2(x), z: r2(z), yaw: r2(yaw), moving: false, seat: undefined, updatedAt: now, name: visitor.name, color: visitor.color });
    } else {
      await ctx.db.insert("presence", { visitorId: visitor._id, roomId, name: visitor.name, color: visitor.color, x: r2(x), z: r2(z), yaw: r2(yaw), moving: false, updatedAt: now });
      await addToCount(ctx, roomId, 1);
    }
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
      }
      await ctx.db.patch(p._id, { roomId, x: r2(x), z: r2(z), yaw: r2(yaw), moving: false, seat: undefined, updatedAt: now });
    } else {
      await ctx.db.insert("presence", { visitorId: visitor._id, roomId, name: visitor.name, color: visitor.color, x: r2(x), z: r2(z), yaw: r2(yaw), moving: false, updatedAt: now });
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
    const others = await ctx.db.query("presence").withIndex("by_room", (q) => q.eq("roomId", p.roomId)).collect();
    if (others.some((o) => o._id !== p._id && o.seat === seat)) return { ok: false };
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
    if (p && patch.name) await ctx.db.patch(p._id, { name: patch.name });
    return { name: patch.name ?? visitor.name, allowDMs: patch.allowDMs ?? visitor.allowDMs };
  },
});

/**
 * Everyone in a room, compactly. Re-runs only when someone in this room moves,
 * arrives or leaves. Capped so a packed room can't flood every client.
 */
export const inRoom = query({
  args: { roomId: v.string() },
  handler: async (ctx, { roomId }) => {
    const rows = await ctx.db.query("presence").withIndex("by_room", (q) => q.eq("roomId", roomId)).take(200);
    // Most recently active first when the room is over the cap.
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    return rows.slice(0, 120).map((p) => ({
      id: p.visitorId, n: p.name, c: p.color, x: p.x, z: p.z, y: p.yaw, m: p.moving, s: p.seat ?? null, t: p.updatedAt,
    }));
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
      const visitor = await ctx.db.get(p.visitorId);
      if (visitor) await ctx.db.patch(visitor._id, { online: false });
    }
    const oldTyping = await ctx.db.query("typing").withIndex("by_expires", (q) => q.lt("expiresAt", Date.now())).take(500);
    for (const t of oldTyping) await ctx.db.delete(t._id);
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
