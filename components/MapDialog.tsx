"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GalleryContent, Locale, Project, RoomId } from "@/content";
import { UI } from "@/lib/i18n";
import { searchProjects } from "@/lib/search";
import { ATMOSPHERE } from "./world/atmosphere";

export function MapDialog({
  content, locale, currentRoom, onClose, onRoom, onProject,
}: {
  content: GalleryContent;
  locale: Locale;
  currentRoom: RoomId;
  onClose: () => void;
  onRoom: (id: RoomId) => void;
  onProject: (slug: string) => void;
}) {
  const ui = UI[locale];
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RoomId>(currentRoom === "main" ? "main" : currentRoom);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "Tab" && dialog.current) {
        const els = dialog.current.querySelectorAll<HTMLElement>("button, input, a[href]");
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const results = useMemo(() => (query.trim() ? searchProjects(content.projects, query) : null), [query, content.projects]);
  const roomProjects = useMemo(() => {
    if (selected === "main") {
      const ids = content.exhibits.filter((e) => e.roomId === "main").map((e) => e.slug);
      return content.projects.filter((p) => ids.includes(p.slug));
    }
    const order = content.exhibits.filter((e) => e.roomId === selected).map((e) => e.slug);
    return order.map((s) => content.projects.find((p) => p.slug === s)!).filter(Boolean);
  }, [selected, content]);

  const main = content.rooms.find((r) => r.id === "main")!;
  const list: Project[] = results ?? roomProjects;
  const selectedRoom = content.rooms.find((r) => r.id === selected)!;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        ref={dialog}
        className="dialog map-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog-head">
          <div>
            <h2 id="map-title">{ui.mapTitle}</h2>
            <p className="muted">{ui.mapHint}</p>
          </div>
          <button type="button" className="btn btn-quiet" onClick={onClose} aria-label={ui.close}>✕</button>
        </header>

        <label className="search">
          <span className="sr-only">{ui.search}</span>
          <input
            ref={input}
            type="search"
            value={query}
            placeholder={ui.searchPlaceholder}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={ui.search}
          />
        </label>

        <div className="map-body">
          <div className="map-canvas" role="group" aria-label={ui.mapTitle}>
            <svg className="map-paths" viewBox="-12.5 -12.5 125 125" preserveAspectRatio="none" aria-hidden="true">
              {content.rooms.filter((r) => r.id !== "main").map((r) => (
                <path
                  key={r.id}
                  d={`M ${main.map.x} ${main.map.y} Q ${(main.map.x + r.map.x) / 2 + 4} ${(main.map.y + r.map.y) / 2} ${r.map.x} ${r.map.y}`}
                  className="map-path"
                />
              ))}
            </svg>
            {content.rooms.map((r) => {
              const a = ATMOSPHERE[r.id];
              const here = r.id === currentRoom;
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`map-node${r.id === "main" ? " is-main" : ""}${selected === r.id ? " is-selected" : ""}${here ? " is-here" : ""}`}
                  style={{ left: `${10 + r.map.x * 0.8}%`, top: `${10 + r.map.y * 0.8}%`, ["--zenith" as string]: a.zenith, ["--glow" as string]: a.glow }}
                  onClick={() => { setQuery(""); setSelected(r.id); }}
                  onDoubleClick={() => onRoom(r.id)}
                  aria-pressed={selected === r.id}
                >
                  <span className="map-node-orb" aria-hidden="true" />
                  <span className="map-node-label">{r.t[locale].title}</span>
                  {here && <span className="map-node-here">{ui.youAreHere}</span>}
                </button>
              );
            })}
          </div>

          <div className="map-list">
            {!results && (
              <div className="map-room-head">
                <div>
                  <h3>{selectedRoom.t[locale].title}</h3>
                  <p className="muted">{selectedRoom.t[locale].subtitle}</p>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => onRoom(selected)}>
                  {selected === currentRoom ? ui.youAreHere : ui.goToRoom}
                </button>
              </div>
            )}
            {list.length === 0 ? (
              <p className="muted">{ui.noResults}</p>
            ) : (
              <ul className="project-list">
                {list.map((p) => {
                  const room = content.rooms.find((r) => r.id === p.roomId)!;
                  return (
                    <li key={p.slug}>
                      <button type="button" className="project-row" onClick={() => onProject(p.slug)}>
                        <span className="dot" style={{ background: room.palette.accent }} aria-hidden="true" />
                        <span className="project-row-text">
                          <strong><bdi>{p.title}</bdi></strong>
                          <span>{p.t[locale]?.oneLine}</span>
                        </span>
                        {results && <span className="muted small">{room.t[locale].title}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
