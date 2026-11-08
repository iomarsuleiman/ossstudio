import { internalMutation } from "./_generated/server";
import { buildBundledContent } from "../content";
import { MAIN_HALL_HIGHLIGHTS } from "../content/rooms";
import { STATIC_ASSETS } from "../content/assets";

const TABLES = [
  "projects", "projectTranslations", "rooms", "roomTranslations",
  "exhibits", "doors", "assets", "galleryConfig",
] as const;

/**
 * Replace all gallery content with the bundled catalogue.
 * Run with: npx convex run seed:run
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of TABLES) {
      for (const doc of await ctx.db.query(table).collect()) await ctx.db.delete(doc._id);
    }
    const content = buildBundledContent();

    for (const p of content.projects) {
      const projectId = await ctx.db.insert("projects", {
        slug: p.slug, title: p.title, catalogName: p.catalogName, roomId: p.roomId,
        category: p.category, openness: p.openness, site: p.site, source: p.source,
        openingOrder: p.openingOrder, motif: p.motif, aliases: p.aliases, comingSoon: p.comingSoon,
        status: "published", version: 1,
      });
      for (const locale of ["en", "ar"] as const) {
        await ctx.db.insert("projectTranslations", { projectId, locale, ...p.t[locale] });
      }
    }
    for (const r of content.rooms) {
      const shape = content.shapes.find((s) => s.roomId === r.id)!;
      await ctx.db.insert("rooms", {
        roomId: r.id, order: r.order, palette: r.palette, map: r.map,
        shape: { width: shape.width, length: shape.length, benches: shape.benches, sections: shape.sections },
      });
      for (const locale of ["en", "ar"] as const) {
        await ctx.db.insert("roomTranslations", { roomId: r.id, locale, ...r.t[locale] });
      }
    }
    for (const e of content.exhibits) {
      const { id, ...rest } = e;
      await ctx.db.insert("exhibits", { exhibitId: id, ...rest });
    }
    for (const d of content.doors) await ctx.db.insert("doors", d);
    for (const a of STATIC_ASSETS) await ctx.db.insert("assets", { ...a, version: content.revision });
    await ctx.db.insert("galleryConfig", {
      revision: content.revision,
      locales: ["en", "ar"],
      featured: MAIN_HALL_HIGHLIGHTS,
      soundtrack: "generative-gallery-v1",
    });
    return { projects: content.projects.length, exhibits: content.exhibits.length };
  },
});
