import "server-only";
import { cache } from "react";
import { buildBundledContent, type GalleryContent } from "@/content";

/**
 * Load the gallery content from Convex when a deployment is configured,
 * otherwise (or if Convex is unreachable / not yet seeded) use the bundled
 * catalogue that also seeds Convex.
 */
export const getContent = cache(async (): Promise<GalleryContent> => {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (url) {
    try {
      const { ConvexHttpClient } = await import("convex/browser");
      const { api } = await import("@/convex/_generated/api");
      const client = new ConvexHttpClient(url);
      const data = (await client.query(api.gallery.content, {})) as unknown as GalleryContent;
      if (data.projects.length > 0 && data.rooms.length > 0) return data;
      console.warn("[content] Convex is empty — run `npx convex run seed:run`. Using bundled catalogue.");
    } catch (err) {
      console.warn("[content] Convex query failed, using bundled catalogue:", err);
    }
  }
  return buildBundledContent();
});
