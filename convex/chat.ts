import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { cleanText, isChannel, rateLimitChat, requireVisitor } from "./visitorAuth";

// Room chats ("room:<roomId>") and the gallery-wide chat ("gallery").
// Messages are kept, so a conversation is still there when you come back.

export const send = mutation({
  args: { token: v.string(), channel: v.string(), body: v.string() },
  handler: async (ctx, { token, channel, body }) => {
    if (!isChannel(channel)) throw new Error("Unknown channel");
    const text = cleanText(body);
    if (!text) throw new Error("Empty message");
    const visitor = await requireVisitor(ctx, token);
    const now = Date.now();
    await rateLimitChat(ctx, visitor, now);
    const id = await ctx.db.insert("messages", { channel, visitorId: visitor._id, name: visitor.name, color: visitor.color, body: text });
    const typing = await ctx.db.query("typing").withIndex("by_visitor", (q) => q.eq("visitorId", visitor._id)).collect();
    for (const t of typing) if (t.channel === channel) await ctx.db.delete(t._id);
    return id;
  },
});

/** The latest `limit` messages of a channel, oldest first. Raise `limit` to load earlier ones. */
export const list = query({
  args: { channel: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { channel, limit }) => {
    if (!isChannel(channel)) return { messages: [], more: false };
    const n = Math.max(1, Math.min(200, Math.floor(limit ?? 50)));
    const rows = await ctx.db.query("messages").withIndex("by_channel", (q) => q.eq("channel", channel)).order("desc").take(n + 1);
    const more = rows.length > n;
    return {
      more,
      messages: rows.slice(0, n).reverse().map((m) => ({ id: m._id, at: m._creationTime, from: m.visitorId, name: m.name, color: m.color, body: m.body })),
    };
  },
});

/**
 * Typing indicator for a chat channel or a private conversation ("dm:<id>").
 * Clients call it at most every few seconds while typing; it expires on its own.
 */
export const setTyping = mutation({
  args: { token: v.string(), channel: v.string(), typing: v.boolean() },
  handler: async (ctx, { token, channel, typing }) => {
    if (!isChannel(channel) && !/^dm:[a-z0-9]+$/i.test(channel)) throw new Error("Unknown channel");
    const visitor = await requireVisitor(ctx, token);
    if (channel.startsWith("dm:")) {
      const conv = await ctx.db.normalizeId("conversations", channel.slice(3));
      const c = conv && (await ctx.db.get(conv));
      if (!c || (c.a !== visitor._id && c.b !== visitor._id)) throw new Error("Not your conversation");
    }
    const mine = (await ctx.db.query("typing").withIndex("by_visitor", (q) => q.eq("visitorId", visitor._id)).collect()).find((t) => t.channel === channel);
    if (!typing) { if (mine) await ctx.db.delete(mine._id); return; }
    const expiresAt = Date.now() + 6000;
    if (mine) await ctx.db.patch(mine._id, { expiresAt });
    else await ctx.db.insert("typing", { channel, visitorId: visitor._id, name: visitor.name, expiresAt });
  },
});

export const whoIsTyping = query({
  args: { channel: v.string() },
  handler: async (ctx, { channel }) => {
    const rows = await ctx.db.query("typing").withIndex("by_channel", (q) => q.eq("channel", channel)).take(20);
    // Clients also hide entries whose expiresAt has passed on their own clock.
    return rows.map((t) => ({ id: t.visitorId, name: t.name, until: t.expiresAt }));
  },
});
