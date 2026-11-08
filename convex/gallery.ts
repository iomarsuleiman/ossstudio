import { query } from "./_generated/server";

/**
 * Everything the gallery needs in one read: rooms, all 166 projects in both
 * languages, artwork placements and doors. ~150 KB, cached by Convex.
 */
export const content = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query("galleryConfig").first();
    const rooms = await ctx.db.query("rooms").collect();
    const roomT = await ctx.db.query("roomTranslations").collect();
    const projects = await ctx.db.query("projects").collect();
    const projectT = await ctx.db.query("projectTranslations").collect();
    const exhibits = await ctx.db.query("exhibits").collect();
    const doors = await ctx.db.query("doors").collect();

    const tByProject = new Map<string, Record<string, unknown>>();
    for (const t of projectT) {
      const entry = tByProject.get(t.projectId) ?? {};
      entry[t.locale] = { oneLine: t.oneLine, why: t.why, installation: t.installation, caution: t.caution };
      tByProject.set(t.projectId, entry);
    }

    return {
      revision: config?.revision ?? "unseeded",
      source: "convex" as const,
      rooms: rooms
        .sort((a, b) => a.order - b.order)
        .map((r) => ({
          id: r.roomId, order: r.order, palette: r.palette, map: r.map,
          t: Object.fromEntries(
            roomT.filter((t) => t.roomId === r.roomId).map((t) => [t.locale, { title: t.title, subtitle: t.subtitle }]),
          ),
        })),
      shapes: rooms.map((r) => ({ roomId: r.roomId, ...r.shape })),
      projects: projects
        .filter((p) => p.status === "published")
        .map((p) => ({
          slug: p.slug, title: p.title, catalogName: p.catalogName, roomId: p.roomId,
          category: p.category, openness: p.openness, site: p.site, source: p.source,
          openingOrder: p.openingOrder, motif: p.motif,
          t: tByProject.get(p._id) ?? {},
        })),
      exhibits: exhibits.map(({ _id, _creationTime, exhibitId, ...e }) => ({ id: exhibitId, ...e })),
      doors: doors.map(({ _id, _creationTime, ...d }) => d),
    };
  },
});

/** Prefetch manifest: every first-party asset the site owns. */
export const manifest = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query("galleryConfig").first();
    const assets = await ctx.db.query("assets").collect();
    return {
      revision: config?.revision ?? "unseeded",
      assets: assets
        .sort((a, b) => a.priority - b.priority)
        .map(({ key, kind, url, bytes, priority, group }) => ({ key, kind, url, bytes, priority, group })),
    };
  },
});
