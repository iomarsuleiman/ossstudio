"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GalleryContent, Locale, Project } from "@/content";
import { UI } from "@/lib/i18n";
import { collection, useCollection } from "@/lib/collection";
import { artworkUrl, roomFor } from "@/lib/artworks";

function Thumb({ project, content }: { project: Project; content: GalleryContent }) {
  const [src, setSrc] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const el = useRef<HTMLSpanElement>(null);
  // Paint only when the thumbnail scrolls into view.
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) { setVisible(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: "200px" });
    io.observe(node);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    artworkUrl(project, roomFor(content, project)).then((u) => alive && setSrc(u)).catch(() => {});
    return () => { alive = false; };
  }, [visible, project, content]);
  const room = roomFor(content, project);
  return (
    <span ref={el} className="thumb" style={{ background: room.palette.wall }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" decoding="async" />}
    </span>
  );
}

export { Thumb };

export function CollectionShelf({
  content, locale, onClose, onCheckout, onGoTo,
}: {
  content: GalleryContent;
  locale: Locale;
  onClose: () => void;
  onCheckout: (slugs: string[]) => void;
  onGoTo?: (slug: string) => void;
}) {
  const ui = UI[locale];
  const items = useCollection();
  const projects = useMemo(() => items.map((s) => content.projects.find((p) => p.slug === s)).filter((p): p is Project => !!p), [items, content]);
  const [unselected, setUnselected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selected = projects.filter((p) => !unselected.has(p.slug)).map((p) => p.slug);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div ref={dialog} className="dialog shelf" role="dialog" aria-modal="true" aria-labelledby="shelf-title" onClick={(e) => e.stopPropagation()}>
        <header className="dialog-head">
          <div>
            <h2 id="shelf-title">{ui.myCollection}</h2>
            <p className="muted" aria-live="polite">{ui.resultsCount(projects.length)}</p>
          </div>
          <button type="button" className="btn btn-quiet" onClick={onClose} aria-label={ui.close}>✕</button>
        </header>

        {projects.length === 0 ? (
          <div className="shelf-empty">
            <div className="shelf-empty-art" aria-hidden="true" />
            <p className="shelf-empty-title">{ui.emptyCollection}</p>
            <p className="muted">{ui.emptyCollectionHint}</p>
          </div>
        ) : (
          <ul className="shelf-list">
            {projects.map((p, i) => {
              const t = p.t[locale] ?? p.t.en;
              const checked = !unselected.has(p.slug);
              return (
                <li key={p.slug} className="shelf-item">
                  <label className="shelf-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setUnselected((u) => { const n = new Set(u); if (checked) n.add(p.slug); else n.delete(p.slug); return n; })}
                      aria-label={p.title}
                    />
                  </label>
                  <Thumb project={p} content={content} />
                  <div className="shelf-text">
                    <strong><bdi>{p.title}</bdi></strong>
                    <span>{t.oneLine}</span>
                    <span className="muted small">
                      {roomFor(content, p).t[locale].title}
                      {p.site && <> · <a href={p.site} target="_blank" rel="noopener noreferrer">{ui.visitWebsite}</a></>}
                    </span>
                  </div>
                  <div className="shelf-actions">
                    {onGoTo && <button type="button" className="btn btn-small" onClick={() => onGoTo(p.slug)}>{ui.teleportBack}</button>}
                    <button type="button" className="btn btn-small btn-quiet" onClick={() => collection.move(p.slug, -1)} disabled={i === 0} aria-label={`${ui.moveUp}: ${p.title}`}>↑</button>
                    <button type="button" className="btn btn-small btn-quiet" onClick={() => collection.move(p.slug, 1)} disabled={i === projects.length - 1} aria-label={`${ui.moveDown}: ${p.title}`}>↓</button>
                    <button type="button" className="btn btn-small btn-quiet" onClick={() => collection.remove(p.slug)}>{ui.removeFromCollection}</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <footer className="shelf-foot">
          <p className="muted small">{ui.storageNote}</p>
          <div className="shelf-foot-actions">
            {projects.length > 0 && (confirming ? (
              <span className="confirm" role="alert">
                {ui.clearConfirm}{" "}
                <button type="button" className="btn btn-small" onClick={() => { collection.clear(); setConfirming(false); }}>{ui.clearAll}</button>{" "}
                <button type="button" className="btn btn-small btn-quiet" onClick={() => setConfirming(false)}>{ui.cancel}</button>
              </span>
            ) : (
              <button type="button" className="btn btn-quiet" onClick={() => setConfirming(true)}>{ui.clearAll}</button>
            ))}
            <button type="button" className="btn btn-primary" disabled={selected.length === 0} onClick={() => onCheckout(selected)}>
              {ui.checkout}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
