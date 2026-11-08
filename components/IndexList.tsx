"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { OPENNESS_TEXT, type GalleryContent, type Locale } from "@/content";
import { UI, dirOf } from "@/lib/i18n";
import { searchProjects } from "@/lib/search";

/** Accessible 2D index: every artwork, grouped by room, searchable. */
export function IndexList({ content, locale }: { content: GalleryContent; locale: Locale }) {
  const ui = UI[locale];
  const [query, setQuery] = useState("");
  const results = useMemo(() => (query.trim() ? new Set(searchProjects(content.projects, query).map((p) => p.slug)) : null), [query, content.projects]);
  const other: Locale = locale === "en" ? "ar" : "en";

  return (
    <main className="index-page" dir={dirOf(locale)}>
      <header className="index-head">
        <div>
          <Link className="link small" href={`/${locale}`}>← {ui.backToGallery}</Link>
          <h1>{ui.indexTitle}</h1>
          <p className="muted">{ui.indexIntro}</p>
        </div>
        <Link className="btn" href={`/${other}/index`} lang={other}>{ui.language}</Link>
      </header>
      <label className="search">
        <span className="sr-only">{ui.search}</span>
        <input type="search" value={query} placeholder={ui.searchPlaceholder} aria-label={ui.search} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {results?.size === 0 && <p className="muted">{ui.noResults}</p>}
      {content.rooms.filter((r) => r.id !== "main").map((room) => {
        const slugs = content.exhibits.filter((e) => e.roomId === room.id).map((e) => e.slug);
        const projects = slugs.map((s) => content.projects.find((p) => p.slug === s)!).filter((p) => p && (!results || results.has(p.slug)));
        if (!projects.length) return null;
        return (
          <section key={room.id} className="index-room" aria-labelledby={`room-${room.id}`}>
            <h2 id={`room-${room.id}`}>
              <span className="dot" style={{ background: room.palette.accent }} aria-hidden="true" /> {room.t[locale].title}
            </h2>
            <p className="muted">{room.t[locale].subtitle} · {ui.roomCount(projects.length)}</p>
            <ul className="index-grid">
              {projects.map((p) => (
                <li key={p.slug} className="index-card">
                  <h3><bdi>{p.title}</bdi></h3>
                  <p>{p.t[locale]?.oneLine}</p>
                  <p className="muted small">{OPENNESS_TEXT[p.openness][locale].label}</p>
                  <div className="index-actions">
                    <Link className="btn btn-small btn-primary" href={`/${locale}/exhibit/${p.slug}`}>{ui.readMore}</Link>
                    <Link className="btn btn-small" href={`/${locale}?at=${p.slug}`}>{ui.walkTo}</Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
