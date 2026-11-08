import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const locale = v.union(v.literal("en"), v.literal("ar"));
const roomId = v.string();

export default defineSchema({
  projects: defineTable({
    slug: v.string(),
    title: v.string(),
    catalogName: v.string(),
    roomId,
    category: v.string(),
    openness: v.string(),
    site: v.string(),
    source: v.string(),
    openingOrder: v.optional(v.number()),
    motif: v.optional(v.string()),
    aliases: v.optional(v.array(v.string())),
    comingSoon: v.optional(v.boolean()),
    status: v.union(v.literal("published"), v.literal("draft")),
    version: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_room", ["roomId"]),

  projectTranslations: defineTable({
    projectId: v.id("projects"),
    locale,
    oneLine: v.string(),
    why: v.optional(v.string()),
    installation: v.optional(v.string()),
    caution: v.optional(v.string()),
  }).index("by_project_locale", ["projectId", "locale"]),

  rooms: defineTable({
    roomId,
    order: v.number(),
    palette: v.object({
      fog: v.string(), wall: v.string(), floor: v.string(), accent: v.string(), trim: v.string(),
    }),
    map: v.object({ x: v.number(), y: v.number() }),
    shape: v.object({
      width: v.number(),
      length: v.number(),
      benches: v.array(v.object({ x: v.number(), z: v.number() })),
      sections: v.optional(v.array(v.object({ id: v.union(v.literal("linux"), v.literal("inventions")), z: v.number() }))),
    }),
  }).index("by_roomId", ["roomId"]),

  roomTranslations: defineTable({
    roomId,
    locale,
    title: v.string(),
    subtitle: v.string(),
  }).index("by_room_locale", ["roomId", "locale"]),

  exhibits: defineTable({
    exhibitId: v.string(),
    slug: v.string(),
    roomId,
    kind: v.union(v.literal("frame"), v.literal("highlight"), v.literal("pedestal")),
    x: v.number(), y: v.number(), z: v.number(),
    rotY: v.number(),
    w: v.number(), h: v.number(),
    spawn: v.object({ x: v.number(), z: v.number(), yaw: v.number() }),
  }).index("by_room", ["roomId"]),

  doors: defineTable({
    roomId,
    to: roomId,
    x: v.number(), z: v.number(),
    rotY: v.number(),
    side: v.union(v.literal("left"), v.literal("right"), v.literal("front"), v.literal("back")),
    arrive: v.object({ x: v.number(), z: v.number(), yaw: v.number() }),
  }).index("by_room", ["roomId"]),

  // Static media lives on the CDN (/public); this table only describes it
  // for the prefetch manifest.
  assets: defineTable({
    key: v.string(),
    kind: v.string(),
    url: v.string(),
    bytes: v.optional(v.number()),
    version: v.string(),
    priority: v.number(),
    group: v.string(),
  }).index("by_key", ["key"]),

  galleryConfig: defineTable({
    revision: v.string(),
    locales: v.array(locale),
    featured: v.array(v.string()),
    soundtrack: v.string(),
  }),
});
