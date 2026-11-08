"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GalleryContent, Locale, Project, RoomId } from "@/content";
import { UI } from "@/lib/i18n";
import { searchProjects } from "@/lib/search";

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
          <svg className="map-svg" viewBox="0 0 100 100" role="group" aria-label={ui.mapTitle}>
            {content.rooms.filter((r) => r.id !== "main").map((r) => (
              <line key={r.id} x1={main.map.x} y1={main.map.y} x2={r.map.x} y2={r.map.y} className="map-path" />
            ))}
            {content.rooms.map((r) => {
              const isMain = r.id === "main";
              const w = isMain ? 26 : 25, h = isMain ? 14 : 11;
              const here = r.id === currentRoom;
              return (
                <g
                  key={r.id}
                  transform={`translate(${r.map.x - w / 2} ${r.map.y - h / 2})`}
                  className={`map-room${selected === r.id ? " is-selected" : ""}${here ? " is-here" : ""}`}
                  onClick={() => { setQuery(""); setSelected(r.id); }}
                >
                  <rect width={w} height={h} rx={3} style={{ fill: r.palette.wall, stroke: r.palette.accent }} />
                  <foreignObject width={w} height={h}>
                    <div className="map-room-label">{r.t[locale].title}</div>
                  </foreignObject>
                  {here && <circle cx={w - 2.5} cy={2.5} r={1.4} className="map-here" />}
                </g>
              );
            })}
          </svg>

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
            {/* Room buttons are also offered as a plain list for keyboard and screen readers. */}
            {!results && (
              <div className="room-chips" role="list">
                {content.rooms.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="listitem"
                    className={`chip${selected === r.id ? " is-on" : ""}`}
                    aria-pressed={selected === r.id}
                    onClick={() => setSelected(r.id)}
                  >
                    {r.t[locale].title}
                  </button>
                ))}
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
