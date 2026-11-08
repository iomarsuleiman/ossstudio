"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { OPENNESS_TEXT, type GalleryContent, type Locale, type Project, type RoomId } from "@/content";
import { UI, dirOf } from "@/lib/i18n";
import { normalise, searchProjects } from "@/lib/search";
import { useCollection } from "@/lib/collection";
import { CollectButton } from "./CollectButton";
import { CollectionShelf, Thumb } from "./CollectionShelf";
import { GiftShop } from "./GiftShop";

type View = "all" | "featured" | "soon" | "collected";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");
const letterOf = (p: Project) => {
  const c = normalise(p.title).charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
};

/** Accessible 2D index of every artwork: search, A–Z, filters, and the same collection as the 3D world. */
export function IndexList({ content, locale }: { content: GalleryContent; locale: Locale }) {
  const ui = UI[locale];
  const [query, setQuery] = useState("");
  const [room, setRoom] = useState<RoomId | "all">("all");
  const [view, setView] = useState<View>("all");
  const [shelf, setShelf] = useState(false);
  const [checkout, setCheckout] = useState<string[] | null>(null);
  const collected = useCollection();
  const other: Locale = locale === "en" ? "ar" : "en";

  const list = useMemo(() => {
    let items = query.trim() ? searchProjects(content.projects, query) : [...content.projects].sort((a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" }));
    if (room !== "all") items = items.filter((p) => p.roomId === room);
    if (view === "featured") items = items.filter((p) => p.openingOrder);
    if (view === "soon") items = items.filter((p) => p.comingSoon);
    if (view === "collected") items = items.filter((p) => collected.includes(p.slug));
    return items;
  }, [query, room, view, collected, content.projects]);

  const filtered = query.trim() !== "" || room !== "all" || view !== "all";
  const present = new Set(list.map(letterOf));
  const sortedByTitle = !query.trim();

  return (
    <main className="index-page" dir={dirOf(locale)}>
      <header className="index-head">
        <div>
          <Link className="link small" href={`/${locale}`}>← {ui.backToGallery}</Link>
          <h1>{ui.indexTitle}</h1>
          <p className="muted">{ui.indexIntro}</p>
        </div>
        <div className="index-head-actions">
          <button type="button" className="btn" onClick={() => setShelf(true)}>✦ {ui.collectionButton(collected.length)}</button>
          <Link className="btn" href={`/${other}/index`} lang={other}>{ui.language}</Link>
        </div>
      </header>

      <div className="index-tools">
        <label className="search">
          <span className="sr-only">{ui.search}</span>
          <input type="search" value={query} placeholder={ui.searchPlaceholder} aria-label={ui.search} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="index-filters">
          <label className="select">
            <span>{ui.roomFilter}</span>
            <select value={room} onChange={(e) => setRoom(e.target.value as RoomId | "all")}>
              <option value="all">{ui.allRooms}</option>
              {content.rooms.filter((r) => r.id !== "main").map((r) => <option key={r.id} value={r.id}>{r.t[locale].title}</option>)}
            </select>
          </label>
          <div className="segmented" role="group" aria-label={ui.viewAll}>
            {([["all", ui.viewAll], ["featured", ui.viewFeatured], ["soon", ui.viewComingSoon], ["collected", ui.viewCollected]] as [View, string][]).map(([v, label]) => (
              <button key={v} type="button" className={view === v ? "is-on" : ""} aria-pressed={view === v} onClick={() => setView(v)}>{label}</button>
            ))}
          </div>
          {filtered && <button type="button" className="btn btn-small btn-quiet" onClick={() => { setQuery(""); setRoom("all"); setView("all"); }}>{ui.clearFilters}</button>}
        </div>
        {sortedByTitle && (
          <nav className="az" aria-label={ui.azJump}>
            {LETTERS.map((l) => present.has(l)
              ? <a key={l} href={`#letter-${l}`}>{l}</a>
              : <span key={l} aria-hidden="true">{l}</span>)}
          </nav>
        )}
        <p className="muted small" aria-live="polite">{ui.resultsCount(list.length)}</p>
      </div>

      {list.length === 0 ? (
        <div className="index-empty">
          <p>{ui.noResults}</p>
          <button type="button" className="btn" onClick={() => { setQuery(""); setRoom("all"); setView("all"); }}>{ui.clearFilters}</button>
        </div>
      ) : (
        <ul className="index-grid">
          {list.map((p, i) => {
            const letter = letterOf(p);
            const firstOfLetter = sortedByTitle && (i === 0 || letterOf(list[i - 1]) !== letter);
            const r = content.rooms.find((x) => x.id === p.roomId)!;
            const saved = collected.includes(p.slug);
            return (
              <li key={p.slug} className={`index-card${saved ? " is-saved" : ""}`} id={firstOfLetter ? `letter-${letter}` : undefined}>
                <Thumb project={p} content={content} />
                <div className="index-card-body">
                  <h2>
                    <bdi>{p.title}</bdi>
                    {saved && <span className="saved-mark" title={ui.inCollection} aria-label={ui.inCollection}>✦</span>}
                  </h2>
                  <p>{p.t[locale]?.oneLine}</p>
                  <p className="muted small">
                    <span className="dot" style={{ background: r.palette.accent }} aria-hidden="true" /> {r.t[locale].title} · {OPENNESS_TEXT[p.openness][locale].label}
                    {p.comingSoon && <> · <strong>{ui.comingSoon}</strong></>}
                  </p>
                  <div className="index-actions">
                    <Link className="btn btn-small btn-primary" href={`/${locale}/exhibit/${p.slug}`}>{ui.readMore}</Link>
                    <Link className="btn btn-small" href={`/${locale}?at=${p.slug}`}>{ui.walkTo}</Link>
                    <CollectButton slug={p.slug} locale={locale} small />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {shelf && (
        <CollectionShelf
          content={content}
          locale={locale}
          onClose={() => setShelf(false)}
          onCheckout={(slugs) => { setShelf(false); setCheckout(slugs); }}
        />
      )}
      {checkout && <GiftShop content={content} locale={locale} slugs={checkout} onBack={() => { setCheckout(null); setShelf(true); }} />}
    </main>
  );
}
