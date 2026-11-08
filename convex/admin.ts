import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Editorial updates are protected by a shared secret set with:
//   npx convex env set EDITOR_TOKEN <long-random-string>
function assertEditor(token: string) {
  const expected = process.env.EDITOR_TOKEN;
  if (!expected || token !== expected) throw new Error("Not authorised");
}

export const updateProjectText = mutation({
  args: {
    token: v.string(),
    slug: v.string(),
    locale: v.union(v.literal("en"), v.literal("ar")),
    oneLine: v.optional(v.string()),
    why: v.optional(v.string()),
    caution: v.optional(v.string()),
  },
  handler: async (ctx, { token, slug, locale, ...fields }) => {
    assertEditor(token);
    const project = await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!project) throw new Error(`Unknown project ${slug}`);
    const t = await ctx.db
      .query("projectTranslations")
      .withIndex("by_project_locale", (q) => q.eq("projectId", project._id).eq("locale", locale))
      .unique();
    if (!t) throw new Error("Missing translation row");
    const patch = Object.fromEntries(Object.entries(fields).filter(([, val]) => val !== undefined));
    await ctx.db.patch(t._id, patch);
    await ctx.db.patch(project._id, { version: project.version + 1 });
  },
});
