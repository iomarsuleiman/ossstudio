import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { cleanText, isBlocked, pairKey, rateLimitChat, requireVisitor, visitorByToken } from "./visitorAuth";

// Private one-to-one messages. Conversations belong to the two visitors'
// lasting identities, so the history is still there after either of them
// changes room, leaves, or comes back another day.

export const send = mutation({
  args: { token: v.string(), to: v.id("visitors"), body: v.string() },
  handler: async (ctx, { token, to, body }) => {
    const text = cleanText(body);
    if (!text) throw new Error("Empty message");
    const me = await requireVisitor(ctx, token);
    if (to === me._id) throw new Error("That's you");
    const other = await ctx.db.get(to);
    if (!other) throw new Error("Unknown visitor");
    // Either side's block stops the message; so does the recipient turning
    // private messages off (unless they already talk with you).
    if (await isBlocked(ctx, to, me._id)) return { ok: false as const, reason: "unavailable" as const };
    if (await isBlocked(ctx, me._id, to)) return { ok: false as const, reason: "blocked" as const };
    const key = pairKey(me._id, to);
    let conv = await ctx.db.query("conversations").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!other.allowDMs && !conv) return { ok: false as const, reason: "closed" as const };
    const now = Date.now();
    await rateLimitChat(ctx, me, now);
    if (!conv) {
      const [a, b] = me._id < to ? [me._id, to] : [to, me._id];
      const id = await ctx.db.insert("conversations", { key, a, b, lastAt: now, lastFrom: me._id, lastBody: text.slice(0, 140) });
      conv = (await ctx.db.get(id))!;
    } else {
      await ctx.db.patch(conv._id, { lastAt: now, lastFrom: me._id, lastBody: text.slice(0, 140) });
    }
    await ctx.db.insert("directMessages", { conversationId: conv._id, from: me._id, body: text });
    await markReadAt(ctx, conv._id, me._id, now);
    for (const t of await ctx.db.query("typing").withIndex("by_visitor", (q) => q.eq("visitorId", me._id)).collect()) {
      if (t.channel === `dm:${conv._id}`) await ctx.db.delete(t._id);
    }
    return { ok: true as const, conversationId: conv._id };
  },
});

async function markReadAt(ctx: MutationCtx, conversationId: Id<"conversations">, visitorId: Id<"visitors">, at: number) {
  const r = await ctx.db.query("conversationReads").withIndex("by_conversation_visitor", (q) => q.eq("conversationId", conversationId).eq("visitorId", visitorId)).unique();
  if (r) { if (r.lastReadAt < at) await ctx.db.patch(r._id, { lastReadAt: at }); }
  else await ctx.db.insert("conversationReads", { conversationId, visitorId, lastReadAt: at });
}

export const markRead = mutation({
  args: { token: v.string(), conversationId: v.id("conversations") },
  handler: async (ctx, { token, conversationId }) => {
    const me = await requireVisitor(ctx, token);
    const c = await ctx.db.get(conversationId);
    if (!c || (c.a !== me._id && c.b !== me._id)) throw new Error("Not your conversation");
    await markReadAt(ctx, conversationId, me._id, Date.now());
  },
});

/** Your conversations, newest first, with the other person's presence and your unread count. */
export const conversations = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await visitorByToken(ctx, token);
    if (!me) return [];
    const mine = [
      ...(await ctx.db.query("conversations").withIndex("by_a", (q) => q.eq("a", me._id)).order("desc").take(40)),
      ...(await ctx.db.query("conversations").withIndex("by_b", (q) => q.eq("b", me._id)).order("desc").take(40)),
    ].sort((x, y) => y.lastAt - x.lastAt).slice(0, 40);
    const out = [];
    for (const c of mine) {
      const otherId = c.a === me._id ? c.b : c.a;
      const other = await ctx.db.get(otherId);
      const read = await ctx.db.query("conversationReads").withIndex("by_conversation_visitor", (q) => q.eq("conversationId", c._id).eq("visitorId", me._id)).unique();
      const since = read?.lastReadAt ?? 0;
      const newer = c.lastAt > since
        ? await ctx.db.query("directMessages").withIndex("by_conversation", (q) => q.eq("conversationId", c._id).gt("_creationTime", since)).order("desc").take(20)
        : [];
      out.push({
        id: c._id,
        with: otherId,
        name: other?.name ?? "Visitor",
        color: other?.color ?? "#888",
        online: !!other?.online,
        roomId: other?.online ? other.roomId : null,
        lastAt: c.lastAt,
        lastBody: c.lastBody,
        lastFromMe: c.lastFrom === me._id,
        unread: newer.filter((m) => m.from !== me._id).length,
      });
    }
    return out;
  },
});

/** Messages in one of your conversations (oldest first). */
export const thread = query({
  args: { token: v.string(), conversationId: v.id("conversations"), limit: v.optional(v.number()) },
  handler: async (ctx, { token, conversationId, limit }) => {
    const me = await visitorByToken(ctx, token);
    const c = await ctx.db.get(conversationId);
    if (!me || !c || (c.a !== me._id && c.b !== me._id)) return null;
    const otherId = c.a === me._id ? c.b : c.a;
    const n = Math.max(1, Math.min(200, Math.floor(limit ?? 60)));
    const rows = await ctx.db.query("directMessages").withIndex("by_conversation", (q) => q.eq("conversationId", conversationId)).order("desc").take(n + 1);
    const otherRead = await ctx.db.query("conversationReads").withIndex("by_conversation_visitor", (q) => q.eq("conversationId", conversationId).eq("visitorId", otherId)).unique();
    return {
      more: rows.length > n,
      otherReadAt: otherRead?.lastReadAt ?? 0,
      messages: rows.slice(0, n).reverse().map((m) => ({ id: m._id, at: m._creationTime, mine: m.from === me._id, body: m.body })),
    };
  },
});

/** Look up the conversation with someone (to open it from their 💬 icon). */
export const conversationWith = query({
  args: { token: v.string(), other: v.id("visitors") },
  handler: async (ctx, { token, other }) => {
    const me = await visitorByToken(ctx, token);
    if (!me) return null;
    const c = await ctx.db.query("conversations").withIndex("by_key", (q) => q.eq("key", pairKey(me._id, other))).unique();
    const them = await ctx.db.get(other);
    return {
      conversationId: c?._id ?? null,
      name: them?.name ?? "Visitor",
      color: them?.color ?? "#888",
      online: !!them?.online,
      acceptsNew: !!them?.allowDMs,
      blockedByMe: await isBlocked(ctx, me._id, other),
    };
  },
});

// --- Safety ------------------------------------------------------------------------

export const block = mutation({
  args: { token: v.string(), visitorId: v.id("visitors") },
  handler: async (ctx, { token, visitorId }) => {
    const me = await requireVisitor(ctx, token);
    if (visitorId === me._id) return;
    if (!(await isBlocked(ctx, me._id, visitorId))) await ctx.db.insert("blocks", { blocker: me._id, blocked: visitorId });
  },
});

export const unblock = mutation({
  args: { token: v.string(), visitorId: v.id("visitors") },
  handler: async (ctx, { token, visitorId }) => {
    const me = await requireVisitor(ctx, token);
    const b = await ctx.db.query("blocks").withIndex("by_pair", (q) => q.eq("blocker", me._id).eq("blocked", visitorId)).unique();
    if (b) await ctx.db.delete(b._id);
  },
});

/** People you've blocked (their messages and avatars' chat icons are hidden from you). */
export const myBlocks = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = await visitorByToken(ctx, token);
    if (!me) return [];
    const rows = await ctx.db.query("blocks").withIndex("by_pair", (q) => q.eq("blocker", me._id)).take(500);
    const out = [];
    for (const b of rows) {
      const v = await ctx.db.get(b.blocked);
      out.push({ id: b.blocked, name: v?.name ?? "Visitor" });
    }
    return out;
  },
});
