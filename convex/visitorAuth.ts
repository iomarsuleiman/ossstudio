// Shared helpers for the multiplayer functions (no Convex functions here).
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const COUNT_SHARDS = 8;
/** Presence older than this is treated as gone (the cron deletes it). */
export const PRESENCE_TTL_MS = 45_000;
export const MAX_BODY = 500;
export const CHAT_MIN_INTERVAL_MS = 700;
export const NAME_MAX = 24;

export const ROOM_IDS = ["main", "everyday", "art", "ai", "internet", "files", "media", "behind", "learn"] as const;

export function isRoom(id: string) {
  return (ROOM_IDS as readonly string[]).includes(id);
}

export function isChannel(channel: string) {
  return channel === "gallery" || (channel.startsWith("room:") && isRoom(channel.slice(5)));
}

export async function visitorByToken(ctx: QueryCtx, token: string): Promise<Doc<"visitors"> | null> {
  if (token.length < 20 || token.length > 128) return null;
  return await ctx.db.query("visitors").withIndex("by_token", (q) => q.eq("token", token)).unique();
}

export async function requireVisitor(ctx: QueryCtx, token: string) {
  const v = await visitorByToken(ctx, token);
  if (!v) throw new Error("Unknown visitor");
  return v;
}

/** Trim, drop control characters, collapse runs of blank lines, cap length. */
export function cleanText(raw: string, max = MAX_BODY) {
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s.length > max ? s.slice(0, max) : s;
}

export function cleanName(raw: string) {
  return cleanText(raw.replace(/\s+/g, " "), NAME_MAX);
}

/** Throws when a visitor sends faster than the allowed rate; records the send otherwise. */
export async function rateLimitChat(ctx: MutationCtx, v: Doc<"visitors">, now: number) {
  if (v.lastChatAt && now - v.lastChatAt < CHAT_MIN_INTERVAL_MS) throw new Error("Slow down");
  await ctx.db.patch(v._id, { lastChatAt: now, lastActiveAt: now });
}

export async function addToCount(ctx: MutationCtx, roomId: string, delta: number) {
  const shard = Math.floor(Math.random() * COUNT_SHARDS);
  const doc = await ctx.db.query("roomCounts").withIndex("by_room_shard", (q) => q.eq("roomId", roomId).eq("shard", shard)).unique();
  if (doc) await ctx.db.patch(doc._id, { count: doc.count + delta });
  else await ctx.db.insert("roomCounts", { roomId, shard, count: delta });
}

export function pairKey(a: Id<"visitors">, b: Id<"visitors">) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export async function isBlocked(ctx: QueryCtx, blocker: Id<"visitors">, blocked: Id<"visitors">) {
  return !!(await ctx.db.query("blocks").withIndex("by_pair", (q) => q.eq("blocker", blocker).eq("blocked", blocked)).unique());
}

/**
 * How often a visitor should send movement, given how busy their room is:
 * quiet rooms feel live, crowded rooms send less so everyone stays smooth.
 */
export function sendIntervalFor(peopleInRoom: number) {
  if (peopleInRoom <= 8) return 200;
  if (peopleInRoom <= 25) return 300;
  if (peopleInRoom <= 60) return 500;
  if (peopleInRoom <= 150) return 800;
  return 1200;
}

// --- Batched room frames ----------------------------------------------------------

/** How often the ticker folds movement into room frames, given how many people are online. */
export function tickIntervalFor(online: number) {
  return online <= 300 ? 500 : 1000;
}

/** How many people a room frame carries (the most recently active first). */
export function frameCapFor(peopleInRoom: number) {
  return peopleInRoom <= 150 ? 120 : 80;
}

/** Ticker writes look this far into the past so they never race in-flight movement writes. */
export const TICK_LAG_MS = 250;

export type FrameRow = [id: string, name: string, color: string, x: number, z: number, yaw: number, moving: 0 | 1, seat: string | null, t: number, open: 0 | 1];
