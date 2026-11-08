"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DoorPlacement, ExhibitPlacement, GalleryContent, Locale, RoomId } from "@/content";
import { arrivalFor } from "@/content/layout";
import { STATIC_ASSETS } from "@/content/assets";
import { UI, dirOf } from "@/lib/i18n";
import { getAudio } from "@/lib/audio";
import { artworkUrl, roomFor } from "@/lib/artworks";
import { PrefetchQueue, type PrefetchState } from "@/lib/prefetch";
import { createWorldStore, loadVisit, saveVisit, type WorldStore } from "@/lib/worldStore";
import { dominantColor } from "@/lib/painter";
import { ExhibitView } from "./ExhibitView";
import { MapDialog } from "./MapDialog";

const World = dynamic(() => import("./world/World"), { ssr: false });

export interface InitialView {
  roomId?: RoomId;
  exhibit?: string;
  at?: string;
}

type Wash = { phase: "idle" | "in" | "out"; kind: "ink" | "sweep"; color: string };

let queue: PrefetchQueue | null = null; // one per visit, survives language switches

function roomPath(locale: Locale, roomId: RoomId) {
  return roomId === "main" ? `/${locale}` : `/${locale}/room/${roomId}`;
}

function realExhibit(content: GalleryContent, slug: string) {
  return content.exhibits.find((e) => e.slug === slug && e.kind !== "highlight");
}

function mainSpawn(content: GalleryContent) {
  const s = content.shapes.find((x) => x.roomId === "main")!;
  return { x: 0, z: s.length / 2 - 5, yaw: Math.PI };
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function GalleryApp({ content, locale, initial }: { content: GalleryContent; locale: Locale; initial: InitialView }) {
  const ui = UI[locale];
  const router = useRouter();
  const audio = getAudio();

  // --- initial placement ---------------------------------------------------------
  const start = useMemo(() => {
    const target = initial.exhibit ?? initial.at;
    const e = target ? realExhibit(content, target) : undefined;
    if (e) return { roomId: e.roomId, pos: { x: e.spawn.x, z: e.spawn.z }, yaw: e.spawn.yaw, entered: !!initial.exhibit, exhibit: initial.exhibit ? e : null };
    const visit = typeof window !== "undefined" ? loadVisit() : null;
    if (visit && (!initial.roomId || initial.roomId === visit.roomId))
      return { roomId: visit.roomId, pos: visit.pos, yaw: visit.yaw, entered: visit.entered, exhibit: null };
    if (initial.roomId && initial.roomId !== "main") {
      const a = arrivalFor(content.doors, "main", initial.roomId);
      return { roomId: initial.roomId, pos: { x: a.x, z: a.z }, yaw: a.yaw, entered: false, exhibit: null };
    }
    const m = mainSpawn(content);
    return { roomId: "main" as RoomId, pos: { x: m.x, z: m.z }, yaw: m.yaw, entered: false, exhibit: null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const storeRef = useRef<WorldStore | null>(null);
  if (!storeRef.current) {
    const s = createWorldStore(start.roomId, start.pos, start.yaw);
    if (start.exhibit) { s.mode = "exhibit"; s.entering = start.exhibit; s.enter = 1; }
    else if (start.entered) s.mode = "walk";
    storeRef.current = s;
  }
  const store = storeRef.current;

  const [entered, setEntered] = useState(start.entered);
  const [roomId, setRoomId] = useState<RoomId>(start.roomId);
  const [openSlug, setOpenSlug] = useState<string | null>(start.exhibit ? start.exhibit.slug : null);
  const [panelLeaving, setPanelLeaving] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [nearby, setNearby] = useState<ExhibitPlacement | null>(null);
  const [wash, setWash] = useState<Wash>({ phase: start.exhibit ? "in" : "idle", kind: "ink", color: start.exhibit ? dominantColor(roomFor(content, content.projects.find((p) => p.slug === start.exhibit!.slug)!)) : "#86394a" });
  const [sound, setSound] = useState(() => (typeof window !== "undefined" ? loadVisit()?.sound ?? false : false) && !audio.muted);
  const [volume, setVolume] = useState(audio.volume);
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [touch, setTouch] = useState(false);
  const [prefetch, setPrefetch] = useState<PrefetchState | null>(null);
  const [hint, setHint] = useState(false);
  const pushed = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  const room = content.rooms.find((r) => r.id === roomId)!;
  const openProject = openSlug ? content.projects.find((p) => p.slug === openSlug) ?? null : null;

  // --- environment ---------------------------------------------------------------
  useEffect(() => {
    setWebgl(hasWebGL());
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => { setReduced(mq.matches); store.reducedMotion = mq.matches; };
    apply();
    mq.addEventListener("change", apply);
    setTouch(window.matchMedia("(pointer: coarse)").matches);
    const t = timers.current;
    return () => { mq.removeEventListener("change", apply); t.forEach(clearTimeout); };
  }, [store]);

  useEffect(() => { store.reducedMotion = reduced; }, [reduced, store]);

  // `?debug` exposes the world state for automated walk-through tests.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("debug")) (window as unknown as { __gallery: WorldStore }).__gallery = store;
  }, [store]);

  // --- persistence (keeps your place across language switches & reloads) ----
  const persist = useCallback(() => {
    saveVisit({ roomId: store.roomId, pos: { ...store.pos }, yaw: store.yaw, entered: store.mode !== "arrival", sound: !audio.muted });
  }, [store, audio]);
  useEffect(() => {
    const id = window.setInterval(persist, 2000);
    window.addEventListener("pagehide", persist);
    return () => { clearInterval(id); window.removeEventListener("pagehide", persist); };
  }, [persist]);

  // --- transitions ------------------------------------------------------------------
  const T = reduced ? { cover: 200, settle: 150, enter: 260, panel: 300 } : { cover: 700, settle: 450, enter: 560, panel: 1000 };

  const teleport = useCallback((to: RoomId, pos: { x: number; z: number; yaw: number }) => {
    setMapOpen(false);
    store.mode = "transition";
    store.target = null;
    audio.sweep();
    setWash({ phase: "in", kind: "sweep", color: dominantColor(content.rooms.find((r) => r.id === to)!) });
    queue?.prioritise((t) => t.key.startsWith(`art:${to}:`));
    later(() => {
      store.roomId = to;
      store.pos = { x: pos.x, z: pos.z };
      store.yaw = pos.yaw;
      store.vel = { x: 0, z: 0 };
      store.nearby = null;
      store.entering = null;
      store.enter = 0;
      store.snapCamera = true;
      setNearby(null);
      setRoomId(to);
      window.history.replaceState(null, "", roomPath(locale, to));
      later(() => {
        setWash((w) => ({ ...w, phase: "out" }));
        store.mode = "walk";
        persist();
        later(() => setWash((w) => ({ ...w, phase: "idle" })), T.cover);
      }, T.settle);
    }, T.cover);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, audio, content, locale, persist, reduced]);

  const teleportToProject = useCallback((slug: string) => {
    const e = realExhibit(content, slug);
    if (e) teleport(e.roomId, e.spawn);
  }, [content, teleport]);

  const teleportToRoom = useCallback((id: RoomId) => {
    if (id === store.roomId) { setMapOpen(false); return; }
    const pos = id === "main" ? mainSpawn(content) : arrivalFor(content.doors, "main", id);
    teleport(id, pos);
  }, [content, store, teleport]);

  const openExhibit = useCallback((e: ExhibitPlacement) => {
    if (store.mode !== "walk") return;
    store.mode = "entering";
    store.entering = e;
    store.target = null;
    audio.sweep();
    const project = content.projects.find((p) => p.slug === e.slug)!;
    later(() => setWash({ phase: "in", kind: "ink", color: dominantColor(roomFor(content, project)) }), T.enter * 0.6);
    later(() => {
      store.mode = "exhibit";
      setPanelLeaving(false);
      setOpenSlug(e.slug);
      window.history.pushState({ exhibit: e.slug }, "", `/${locale}/exhibit/${e.slug}`);
      pushed.current = true;
      requestAnimationFrame(() => heading.current?.focus());
    }, T.panel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, audio, content, locale, reduced]);

  const finishClose = useCallback(() => {
    setPanelLeaving(true);
    audio.sweep(true);
    later(() => {
      setOpenSlug(null);
      setPanelLeaving(false);
      setWash((w) => ({ ...w, phase: "out" }));
      store.mode = "exiting";
      later(() => setWash((w) => ({ ...w, phase: "idle" })), T.cover);
      later(() => { store.mode = "walk"; }, reduced ? 260 : 950);
    }, 260);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, audio, reduced]);

  const closeExhibit = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back(); // popstate finishes the close
      return;
    }
    window.history.replaceState(null, "", roomPath(locale, store.roomId));
    finishClose();
  }, [finishClose, locale, store]);

  // Browser back/forward.
  useEffect(() => {
    const onPop = () => {
      const m = window.location.pathname.match(/\/exhibit\/([^/]+)/);
      if (!m && openSlug) {
        pushed.current = false;
        window.history.replaceState(null, "", roomPath(locale, store.roomId));
        finishClose();
      }
      else if (m && !openSlug) {
        const e = realExhibit(content, m[1]);
        if (!e) return;
        store.roomId = e.roomId; store.pos = { x: e.spawn.x, z: e.spawn.z }; store.yaw = e.spawn.yaw;
        store.entering = e; store.enter = 1; store.mode = "exhibit"; store.snapCamera = true;
        setRoomId(e.roomId);
        setEntered(true);
        setWash({ phase: "in", kind: "ink", color: dominantColor(roomFor(content, content.projects.find((p) => p.slug === e.slug)!)) });
        setOpenSlug(e.slug);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [openSlug, content, store, finishClose, locale]);

  const onDoor = useCallback((d: DoorPlacement) => {
    teleport(d.to, arrivalFor(content.doors, d.roomId, d.to));
  }, [content, teleport]);

  // --- world callbacks --------------------------------------------------------------
  useEffect(() => {
    store.onNearby = (e) => { setNearby(e); if (e) audio.chime(); };
    store.onDoor = onDoor;
    store.onStep = () => audio.footstep();
  }, [store, audio, onDoor]);

  const onExhibitClick = useCallback((id: string) => {
    const e = content.exhibits.find((x) => x.id === id);
    if (!e || store.mode !== "walk") return;
    const close = Math.hypot(e.spawn.x - store.pos.x, e.spawn.z - store.pos.z) < 1.9;
    if (close) openExhibit(e);
    else { store.target = { x: e.spawn.x, z: e.spawn.z }; store.targetExhibit = e.id; }
  }, [content, store, openExhibit]);

  const onFloorClick = useCallback((x: number, z: number) => {
    if (store.mode !== "walk") return;
    store.targetExhibit = null;
    const d = content.doors.find((d) => d.roomId === store.roomId && Math.hypot(d.x - x, d.z - z) < 1.8);
    if (d) {
      const out = { left: [-1, 0], right: [1, 0], front: [0, -1], back: [0, 1] }[d.side];
      store.target = { x: d.x + out[0], z: d.z + out[1] };
    } else store.target = { x, z };
  }, [content, store]);

  // --- keyboard -------------------------------------------------------------------------
  useEffect(() => {
    const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (openSlug) { if (e.key === "Escape") { e.preventDefault(); closeExhibit(); } return; }
      if (mapOpen || !entered) return;
      const move = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      if (move.includes(e.code)) { store.keys.add(e.code); e.preventDefault(); return; }
      if (e.code === "KeyM") { e.preventDefault(); setMapOpen(true); return; }
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      if ((e.code === "KeyE" || (e.key === "Enter" && !onButton)) && store.nearby) { e.preventDefault(); openExhibit(store.nearby); }
    };
    const up = (e: KeyboardEvent) => store.keys.delete(e.code);
    const blur = () => store.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [store, openSlug, mapOpen, entered, closeExhibit, openExhibit]);

  useEffect(() => {
    if (mapOpen) { store.keys.clear(); if (store.mode === "walk") store.mode = "transition"; }
    else if (store.mode === "transition" && wash.phase === "idle" && entered && !openSlug) store.mode = "walk";
  }, [mapOpen, store, wash.phase, entered, openSlug]);

  // --- entering the gallery -----------------------------------------------------------
  const enterGallery = async (withSound: boolean) => {
    setEntered(true);
    store.mode = "walk";
    if (withSound) { await audio.enable(); setSound(true); }
    setHint(true);
    later(() => setHint(false), 12000);
    persist();
  };

  const toggleSound = async () => {
    if (audio.muted) { await audio.enable(); setSound(true); }
    else { audio.disable(); setSound(false); }
    persist();
  };

  const switchLanguage = () => {
    persist();
    const other: Locale = locale === "en" ? "ar" : "en";
    const path = window.location.pathname.replace(/^\/(en|ar)/, `/${other}`);
    router.push(path + window.location.search);
  };

  // --- whole-site prefetch (starts as soon as the entrance is interactive) ----------
  useEffect(() => {
    if (!ready) return;
    if (!queue) {
      queue = new PrefetchQueue(2);
      const other = locale === "en" ? "ar" : "en";
      queue.add([
        ...STATIC_ASSETS.map((a) => ({ key: `asset:${a.key}`, group: "assets" as const, priority: a.priority, run: () => fetch(a.url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); }) })),
        { key: "route:index", group: "routes", priority: 1, run: async () => router.prefetch(`/${locale}/index`) },
        { key: "route:locale", group: "routes", priority: 1, run: async () => router.prefetch(`/${other}`) },
        ...content.projects.map((p) => {
          const home = roomFor(content, p);
          const dist = home.id === store.roomId ? 0 : Math.abs(home.order - (content.rooms.find((r) => r.id === store.roomId)?.order ?? 0));
          return { key: `art:${home.id}:${p.slug}`, group: "artworks" as const, priority: 2 + dist + (p.openingOrder ? 0 : 0.5), run: () => artworkUrl(p, home) };
        }),
      ]);
    }
    return queue.subscribe(setPrefetch);
  }, [ready, content, locale, router, store]);

  // --- render --------------------------------------------------------------------------
  const nearbyProject = nearby ? content.projects.find((p) => p.slug === nearby.slug) : null;
  const showHud = entered && !openSlug;

  return (
    <div className="gallery" dir={dirOf(locale)} data-reduced={reduced || undefined}>
      <a className="skip-link" href={`/${locale}/index`}>{ui.skipToIndex}</a>

      <div className="world" aria-hidden={!!openSlug}>
        {webgl ? (
          <World
            content={content}
            locale={locale}
            roomId={roomId}
            store={store}
            onReady={() => setReady(true)}
            onExhibitClick={onExhibitClick}
            onFloorClick={onFloorClick}
          />
        ) : (
          <div className="no-webgl">
            <p>{ui.noWebgl}</p>
            <Link className="btn btn-primary" href={`/${locale}/index`}>{ui.index}</Link>
          </div>
        )}
      </div>

      {/* Painterly full-screen wash used for entering artworks and teleporting. */}
      <div className={`wash-wrap${reduced ? " is-reduced" : ""}`} aria-hidden="true">
        <div className={`wash wash-${wash.kind} is-${wash.phase}`} style={{ ["--wash" as string]: wash.color }} />
      </div>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <filter id="ink-edge">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="3" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="70" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      {showHud && (
        <header className="hud-top">
          <div className="hud-room">
            <span className="hud-site">{ui.siteTitle}</span>
            <span className="hud-room-name">{room.t[locale].title}</span>
          </div>
          <nav className="hud-actions" aria-label={ui.siteTitle}>
            <button type="button" className="btn btn-glass" onClick={() => setMapOpen(true)} aria-keyshortcuts="M">
              {ui.map}
            </button>
            <button type="button" className="btn btn-glass" onClick={toggleSound} aria-pressed={sound}>
              {sound ? ui.soundOn : ui.soundOff}
            </button>
            {sound && (
              <label className="volume">
                <span className="sr-only">{ui.volume}</span>
                <input type="range" min={0} max={1} step={0.05} value={volume}
                  onChange={(e) => { const v = Number(e.target.value); setVolume(v); audio.setVolume(v); }} />
              </label>
            )}
            <button type="button" className="btn btn-glass" onClick={switchLanguage} aria-label={ui.languageLabel} lang={locale === "en" ? "ar" : "en"}>
              {ui.language}
            </button>
            <Link className="btn btn-glass" href={`/${locale}/index`}>{ui.index}</Link>
          </nav>
        </header>
      )}

      {showHud && (
        <div className="hud-bottom">
          <div className="nearby" aria-live="polite">
            {nearbyProject && nearby && (
              <div className="nearby-card" key={nearby.id}>
                <p className="nearby-title"><bdi>{nearbyProject.title}</bdi></p>
                <p className="nearby-line">{nearbyProject.t[locale]?.oneLine}</p>
                <button type="button" className="btn btn-primary" onClick={() => openExhibit(nearby)} aria-keyshortcuts="E">
                  {ui.enterArtwork}
                  {!touch && <span className="kbd" aria-hidden="true">E</span>}
                </button>
              </div>
            )}
          </div>
          {hint && (
            <p className="controls-hint" role="note">{touch ? ui.controlsTouch : ui.controlsDesktop}</p>
          )}
        </div>
      )}

      {prefetch && entered && !openSlug && !(prefetch.finished && !hint) && (
        <p className="prefetch" aria-live="off">
          {prefetch.finished ? ui.prefetchDone : ui.prefetch(prefetch.artworksDone, prefetch.artworksTotal)}
          {prefetch.paused && !prefetch.finished && (
            <> · {ui.prefetchPaused} <button type="button" className="link" onClick={() => queue?.resume()}>{ui.resume}</button></>
          )}
        </p>
      )}

      {!entered && (
        <div className="arrival" role="dialog" aria-modal="true" aria-labelledby="arrival-title">
          <div className="arrival-card">
            <button type="button" className="btn btn-quiet arrival-lang" onClick={switchLanguage} aria-label={ui.languageLabel} lang={locale === "en" ? "ar" : "en"}>
              {ui.language}
            </button>
            <h1 id="arrival-title" className="arrival-title">{ui.siteTitle}</h1>
            <p className="arrival-tagline">{ui.tagline}</p>
            <div className="arrival-actions">
              <button type="button" className="btn btn-primary btn-large" onClick={() => enterGallery(true)}>{ui.enterSound}</button>
              <button type="button" className="btn btn-large" onClick={() => enterGallery(false)}>{ui.enterQuiet}</button>
            </div>
            <p className="arrival-meta muted">
              {ready ? (touch ? ui.controlsTouch : ui.controlsDesktop) : ui.loadingWorld}
            </p>
            <Link className="link small" href={`/${locale}/index`}>{ui.index}</Link>
          </div>
        </div>
      )}

      {mapOpen && (
        <MapDialog
          content={content}
          locale={locale}
          currentRoom={roomId}
          onClose={() => setMapOpen(false)}
          onRoom={teleportToRoom}
          onProject={teleportToProject}
        />
      )}

      {openProject && (
        <div className={`exhibit-layer${panelLeaving ? " is-leaving" : ""}`} role="dialog" aria-modal="true" aria-label={openProject.title}>
          <ExhibitView
            project={openProject}
            content={content}
            locale={locale}
            headingRef={heading}
            onBack={closeExhibit}
            onVisitRoom={
              store.entering?.kind === "highlight"
                ? () => {
                    const slug = openProject.slug;
                    pushed.current = false;
                    window.history.replaceState(null, "", roomPath(locale, store.roomId));
                    setOpenSlug(null);
                    store.mode = "walk";
                    store.entering = null;
                    store.enter = 0;
                    teleportToProject(slug);
                  }
                : undefined
            }
          />
          <p className="exhibit-return muted small">{ui.returnHere}</p>
        </div>
      )}
    </div>
  );
}
