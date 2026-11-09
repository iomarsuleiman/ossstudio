import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

// Capacity and a fair waiting line, so a rush of visitors can't overwhelm
// the live features. Capacity comes from the GALLERY_CAPACITY environment
// variable (default 500). When the gallery is full, a visitor takes a ticket
// and watches their place in line; as people leave, the ticker admits the
// next ones. Positions are worked out from ticket numbers (O(1) per viewer),
// so a long line costs no more to watch than a short one.
//
// The owner can move through the line with a secret key (QUEUE_OWNER_KEY),
// checked here on the server; without it the skip does nothing.

const ADMITTED_TTL_MS = 120_000; // an admitted visitor has this long to arrive
const WAITING_TTL_MS = 60_000; // a waiting tab that stops pinging loses its place

export function capacity() {
  const n = Number(process.env.GALLERY_CAPACITY);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 500;
}

async function state(ctx: QueryCtx) {
  return await ctx.db.query("queueState").first();
}

async function ensureState(ctx: MutationCtx): Promise<Doc<"queueState">> {
  const s = await state(ctx);
  if (s) return s;
  const id = await ctx.db.insert("queueState", { next: 1, serving: 0, waiting: 0 });
  return (await ctx.db.get(id))!;
}

async function inside(ctx: QueryCtx) {
  let n = 0;
  for (const d of await ctx.db.query("roomCounts").collect()) n += d.count;
  return Math.max(0, n);
}

async function admittedPending(ctx: QueryCtx, limit: number) {
  return (await ctx.db.query("queueTickets").withIndex("by_status_admitted", (q) => q.eq("status", "admitted")).take(limit)).length;
}

async function ticketFor(ctx: QueryCtx, token: string) {
  return await ctx.db.query("queueTickets").withIndex("by_token", (q) => q.eq("token", token)).unique();
}

/** May this visitor come in (or are they already in)? Used by presence.join. */
export async function mayEnter(ctx: QueryCtx, token: string, alreadyInside: boolean) {
  if (alreadyInside) return true;
  const t = await ticketFor(ctx, token);
  if (t?.status === "admitted") return true;
  const s = await state(ctx);
  if (s && s.waiting > 0) return false; // no cutting in line
  const cap = capacity();
  return (await inside(ctx)) + (await admittedPending(ctx, cap)) < cap;
}

/** Arriving: come straight in if there's room, otherwise take a place in line. */
export const request = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (token.length < 20 || token.length > 128) throw new Error("Bad token");
    const now = Date.now();
    const existing = await ticketFor(ctx, token);
    if (existing) {
      await ctx.db.patch(existing._id, { lastSeen: now });
      return { admitted: existing.status === "admitted" };
    }
    // Already walking around (e.g. a reload): nothing to wait for.
    const visitor = await ctx.db.query("visitors").withIndex("by_token", (q) => q.eq("token", token)).unique();
    if (visitor) {
      const p = await ctx.db.query("presence").withIndex("by_visitor", (q) => q.eq("visitorId", visitor._id)).unique();
      if (p) return { admitted: true };
    }
    const s = await ensureState(ctx);
    const cap = capacity();
    const room = s.waiting === 0 && (await inside(ctx)) + (await admittedPending(ctx, cap)) < cap;
    if (room) {
      await ctx.db.insert("queueTickets", { token, seq: s.next, status: "admitted", lastSeen: now, admittedAt: now });
      await ctx.db.patch(s._id, { next: s.next + 1, serving: s.next });
      return { admitted: true };
    }
    await ctx.db.insert("queueTickets", { token, seq: s.next, status: "waiting", lastSeen: now });
    await ctx.db.patch(s._id, { next: s.next + 1, waiting: s.waiting + 1 });
    return { admitted: false };
  },
});

/** Your place in line. Reads only your ticket and the line's counters. */
export const status = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const t = await ticketFor(ctx, token);
    if (!t) return { inLine: false, admitted: false, position: 0, waiting: 0 };
    if (t.status === "admitted") return { inLine: false, admitted: true, position: 0, waiting: 0 };
    const s = await state(ctx);
    const waiting = s?.waiting ?? 0;
    const position = Math.max(1, Math.min(waiting || 1, Math.ceil(t.seq - (s?.serving ?? 0))));
    return { inLine: true, admitted: false, position, waiting };
  },
});

/** Keeps your place while the tab is open. */
export const ping = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const t = await ticketFor(ctx, token);
    if (t) await ctx.db.patch(t._id, { lastSeen: Date.now() });
  },
});

export const leaveLine = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const t = await ticketFor(ctx, token);
    if (!t) return;
    await ctx.db.delete(t._id);
    if (t.status === "waiting") {
      const s = await ensureState(ctx);
      await ctx.db.patch(s._id, { waiting: Math.max(0, s.waiting - 1) });
    }
  },
});

/** Called once you've arrived: your ticket has done its job. */
export async function useTicket(ctx: MutationCtx, token: string) {
  const t = await ticketFor(ctx, token);
  if (t) await ctx.db.delete(t._id);
}

/**
 * Let the next people in as room frees up. Run by the ticker while anyone is
 * in line, and by a cron as a backstop.
 */
export const admit = internalMutation({
  args: {},
  handler: async (ctx) => {
    const s = await state(ctx);
    const now = Date.now();
    // Admitted visitors who never arrived give their place back.
    const expired = await ctx.db.query("queueTickets").withIndex("by_status_admitted", (q) => q.eq("status", "admitted").lt("admittedAt", now - ADMITTED_TTL_MS)).take(500);
    for (const t of expired) await ctx.db.delete(t._id);
    if (!s || s.waiting === 0) return { admitted: 0, waiting: 0 };
    const cap = capacity();
    let free = cap - (await inside(ctx)) - (await admittedPending(ctx, cap));
    let waiting = s.waiting, serving = s.serving, admitted = 0;
    if (free > 0) {
      const next = await ctx.db.query("queueTickets").withIndex("by_status_seq", (q) => q.eq("status", "waiting")).take(Math.min(500, free + 50));
      for (const t of next) {
        if (free <= 0) break;
        waiting--;
        if (now - t.lastSeen > WAITING_TTL_MS) { await ctx.db.delete(t._id); continue; } // closed the tab
        await ctx.db.patch(t._id, { status: "admitted", admittedAt: now });
        serving = Math.max(serving, t.seq);
        free--; admitted++;
      }
    }
    await ctx.db.patch(s._id, { waiting: Math.max(0, waiting), serving });
    return { admitted, waiting: Math.max(0, waiting) };
  },
});

/** Owner only: move 5 places forward, or straight in. Silently does nothing without the right key. */
export const skip = mutation({
  args: { token: v.string(), key: v.string(), all: v.boolean() },
  handler: async (ctx, { token, key, all }) => {
    const expected = process.env.QUEUE_OWNER_KEY;
    if (!expected || expected.length < 16 || !safeEqual(key, expected)) return { ok: false };
    const t = await ticketFor(ctx, token);
    if (!t || t.status !== "waiting") return { ok: false };
    const s = await ensureState(ctx);
    if (all) {
      // Straight in, even when the gallery is full.
      await ctx.db.patch(t._id, { status: "admitted", admittedAt: Date.now() });
      await ctx.db.patch(s._id, { waiting: Math.max(0, s.waiting - 1) });
      return { ok: true };
    }
    const ahead = await ctx.db.query("queueTickets").withIndex("by_status_seq", (q) => q.eq("status", "waiting").lt("seq", t.seq)).order("desc").take(5);
    if (!ahead.length) return { ok: true };
    const target = ahead[ahead.length - 1].seq;
    const before = await ctx.db.query("queueTickets").withIndex("by_status_seq", (q) => q.eq("status", "waiting").lt("seq", target)).order("desc").first();
    // Slot in just ahead of the 5th person in front (between them and whoever is ahead of them).
    const seq = before ? (before.seq + target) / 2 : Math.max(s.serving, target - 1) + (target - Math.max(s.serving, target - 1)) / 2;
    await ctx.db.patch(t._id, { seq });
    return { ok: true };
  },
});

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** For the waiting screen. */
export const capacityInfo = query({
  args: {},
  handler: async (ctx) => {
    const s = await state(ctx);
    return { capacity: capacity(), inside: await inside(ctx), waiting: s?.waiting ?? 0 };
  },
});
