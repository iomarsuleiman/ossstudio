import type { MetadataRoute } from "next";
import { buildBundledContent, LOCALES } from "@/content";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { rooms, projects } = buildBundledContent();
  return LOCALES.flatMap((l) => [
    { url: `${base}/${l}` },
    { url: `${base}/${l}/index` },
    ...rooms.filter((r) => r.id !== "main").map((r) => ({ url: `${base}/${l}/room/${r.id}` })),
    ...projects.map((p) => ({ url: `${base}/${l}/exhibit/${p.slug}` })),
  ]);
}
