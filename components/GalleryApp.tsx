"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ViewTransition, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DoorPlacement, ExhibitPlacement, GalleryContent, Locale, RoomId } from "@/content";
import { arrivalFor } from "@/content/layout";
import { STATIC_ASSETS } from "@/content/assets";
import { UI, dirOf } from "@/lib/i18n";
import { getAudio } from "@/lib/audio";
import { artworkUrl, isArtworkReady, projectsShownIn, reachableRooms, releaseArtworks, roomFor } from "@/lib/artworks";
import { PrefetchQueue, type PrefetchState } from "@/lib/prefetch";
import { createWorldStore, loadVisit, saveVisit, type WorldStore } from "@/lib/worldStore";
import { dominantColor } from "@/lib/painter";
import { ExhibitView } from "./ExhibitView";
import { MapDialog } from "./MapDialog";
import { Joystick } from "./Joystick";
import { ATMOSPHERE } from "./world/atmosphere";
import { CollectButton } from "./CollectButton";
import { CollectionShelf } from "./CollectionShelf";
import { GiftShop } from "./GiftShop";
import { collection, useCollection } from "@/lib/collection";
import { NetStore } from "@/lib/multiplayer/net";
import { ownerKey } from "@/lib/multiplayer/local";
import { MultiplayerLayer, multiplayerEnabled, type ChatRequest } from "./multiplayer/MultiplayerLayer";
import { PerfOverlay } from "./multiplayer/PerfOverlay";

const World = dynamic(() => import("./world/World"), { ssr: false });

export interface InitialView {
  roomId?: RoomId;
  exhibit?: string;
  at?: string;
}

type Wash = { phase: "idle" | "in" | "out"; kind: "ink" | "sweep"; color: string };
/** Full-screen teleport veil. `leaving` is only used where View Transitions are unsupported. */
type Veil = { to: RoomId; leaving?: boolean };

const supportsViewTransitions = () => typeof document !== "undefined" && "startViewTransition" in document;

/** Facing direction from a spot toward an artwork (forward = (sin yaw, cos yaw)). */
function yawToward(from: { x: number; z: number }, e: ExhibitPlacement) {
  const off = e.kind === "pedestal" ? 0.35 : 0;
  const cx = e.x + Math.sin(e.rotY) * off, cz = e.z + Math.cos(e.rotY) * off;
  return Math.atan2(cx - from.x, cz - from.z);
}

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
    // A saved visit (language switch, reload) is restored after mount so the
    // server and the first client render agree.
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
  const netRef = useRef<NetStore | null>(null);
  if (!netRef.current) netRef.current = new NetStore();
  const net = netRef.current;
  const [chatOpen, setChatOpen] = useState(false);
  const [chatRequest, setChatRequest] = useState<ChatRequest | null>(null);
  const onChatWith = useCallback((visitorId: string) => {
    if (document.pointerLockElement) document.exitPointerLock();
    setChatRequest({ tab: "messages", with: visitorId, nonce: Date.now() });
    setChatOpen(true);
  }, []);

  const [entered, setEntered] = useState(start.entered);
  const [roomId, setRoomId] = useState<RoomId>(start.roomId);
  const [openSlug, setOpenSlug] = useState<string | null>(start.exhibit ? start.exhibit.slug : null);
  const [panelLeaving, setPanelLeaving] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  // The artwork whose details you asked for by clicking it (nothing opens by just walking up).
  const [selected, setSelected] = useState<ExhibitPlacement | null>(null);
  const [mouseLook, setMouseLook] = useState(false);
  const [seated, setSeated] = useState(false);
  const [wash, setWash] = useState<Wash>({ phase: start.exhibit ? "in" : "idle", kind: "ink", color: start.exhibit ? dominantColor(roomFor(content, content.projects.find((p) => p.slug === start.exhibit!.slug)!)) : "#86394a" });
  const [sound, setSound] = useState(false);
  const [volume, setVolume] = useState(audio.volume);
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [touch, setTouch] = useState(false);
  // Optional third-person view; first person is the default.
  const [view, setView] = useState<"first" | "third">("first");
  const [prefetch, setPrefetch] = useState<PrefetchState | null>(null);
  const [hint, setHint] = useState(false);
  const [veil, setVeil] = useState<Veil | null>(null);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [checkout, setCheckout] = useState<string[] | null>(null);
  const collected = useCollection();
  const [nearMap, setNearMap] = useState(false);
  const pushed = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  const room = content.rooms.find((r) => r.id === roomId)!;
  // The room React has actually committed (room switches render as a transition).
  const committedRoom = useRef<RoomId>(roomId);
  useEffect(() => { committedRoom.current = roomId; }, [roomId]);
  const openProject = openSlug ? content.projects.find((p) => p.slug === openSlug) ?? null : null;

  // --- environment ---------------------------------------------------------------
  useEffect(() => {
    setWebgl(hasWebGL());
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => { setReduced(mq.matches); store.reducedMotion = mq.matches; };
    apply();
    mq.addEventListener("change", apply);
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    setTouch(coarse);
    try {
      if (localStorage.getItem("osg:view") === "third") {
        setView("third");
        store.view = "third";
        store.viewBlend = 1;
        store.bodyYaw = store.yaw;
      }
    } catch {
      /* storage unavailable */
    }
    const t = timers.current;
    return () => { mq.removeEventListener("change", apply); t.forEach(clearTimeout); };
  }, [store]);

  useEffect(() => { store.reducedMotion = reduced; }, [reduced, store]);

  // Restore a saved visit (same room, or no room in the URL) once mounted.
  useEffect(() => {
    setSound(!audio.muted);
    if (initial.exhibit || initial.at) return;
    const visit = loadVisit();
    if (!visit || (initial.roomId && initial.roomId !== "main" && initial.roomId !== visit.roomId)) return;
    if (initial.roomId === "main" && visit.roomId !== "main" && !visit.entered) return;
    store.roomId = visit.roomId;
    store.pos = { ...visit.pos };
    store.yaw = store.targetYaw = visit.yaw;
    store.snapCamera = true;
    setRoomId(visit.roomId);
    if (visit.entered) { setEntered(true); store.mode = "walk"; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pick up an owner key from the address (#owner=…) and clean it out of the bar straight away.
  useEffect(() => { if (multiplayerEnabled()) ownerKey(); }, []);

  // `?debug` exposes the world state for automated walk-through tests and shows performance numbers.
  const [debug, setDebug] = useState(false);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("debug")) return;
    (window as unknown as { __gallery: WorldStore; __net: NetStore }).__gallery = store;
    (window as unknown as { __net: NetStore }).__net = net;
    (window as unknown as { __content: GalleryContent }).__content = content;
    setDebug(true);
  }, [store, net, content]);

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

  // Full-screen teleport: a painted veil sweeps in (React <ViewTransition>),
  // the world changes behind it, then it sweeps away.
  const teleport = useCallback((to: RoomId, pos: { x: number; z: number; yaw: number }) => {
    setMapOpen(false);
    store.mode = "transition";
    store.target = null;
    store.path = [];
    store.destination = null;
    store.targetSeat = null;
    store.keys.clear();
    store.joy = { x: 0, y: 0 };
    audio.sweep();
    queue?.prioritise((t) => t.key.startsWith(`art:${to}:`));
    const vt = supportsViewTransitions();
    // A recently visited room is still mounted (hidden): switching back is instant.
    const wasLoaded = store.loadedRooms.includes(to);
    startTransition(() => setVeil({ to }));
    // Kept short: the veil only needs to hide the swap, not make you wait.
    const cover = reduced ? 220 : 520;
    later(() => {
      store.roomId = to;
      store.pos = { x: pos.x, z: pos.z };
      store.yaw = store.targetYaw = pos.yaw;
      store.pitch = store.targetPitch = 0;
      store.vel = { x: 0, z: 0 };
      store.nearby = null;
      store.nearMap = false;
      store.entering = null;
      store.enter = 0;
      store.seat = null;
      store.sitBlend = 0;
      store.standFrom = null;
      store.onSeatChange?.(null);
      store.snapCamera = true;
      setSelected(null);
      setNearMap(false);
      // Mounting a room is the heaviest React work in the app: let React
      // spread it over several frames so the veil keeps animating smoothly.
      startTransition(() => setRoomId(to));
      window.history.replaceState(null, "", roomPath(locale, to));
      // Lift the veil as soon as the destination's artworks are painted and
      // uploaded (no fake waiting), with a short floor so the room has drawn
      // a frame or two, and a ceiling so a slow device never waits long.
      const destination = projectsShownIn(content, to);
      const startWait = performance.now();
      const reveal = () => {
        const waited = performance.now() - startWait;
        const ready = committedRoom.current === to && (wasLoaded || (store.texturesPending === 0 && destination.every((p) => isArtworkReady(p.slug))));
        // Never reveal before the new room is actually on screen.
        if (waited < (wasLoaded ? 60 : 140) || (!ready && waited < 1100) || committedRoom.current !== to) { later(reveal, 50); return; }
        if (vt) startTransition(() => setVeil(null));
        else {
          setVeil({ to, leaving: true });
          later(() => setVeil(null), reduced ? 220 : 600);
        }
        store.mode = "walk";
        persist();
      };
      later(reveal, 0);
    }, cover);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, audio, locale, persist, reduced, content]);

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
    store.path = [];
    store.destination = null;
    setSelected(null);
    if (document.pointerLockElement) document.exitPointerLock();
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
        store.roomId = e.roomId; store.pos = { x: e.spawn.x, z: e.spawn.z }; store.yaw = store.targetYaw = e.spawn.yaw;
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
    // Looking at an artwork only makes it glow softly; details open on click.
    store.onNearby = () => {};
    store.onArrive = (e) => { setSelected(e); audio.chime(); };
    store.onSeatChange = (seat) => { setSeated(!!seat); if (seat) setSelected(null); };
    store.onNearDoor = (to) => {
      setNearDoor(to);
      // Paint the next room's artworks before you reach the door.
      queue?.prioritise((t) => t.key.startsWith(`art:${to}:`));
      projectsShownIn(content, to).forEach((p) => { artworkUrl(p, roomFor(content, p), { background: true }).catch(() => {}); });
    };
    store.onDoor = onDoor;
    store.onStep = () => audio.footstep();
    store.onNearMap = (near) => setNearMap(near);
  }, [store, audio, onDoor, content]);

  const onExhibitClick = useCallback((id: string) => {
    const e = content.exhibits.find((x) => x.id === id);
    if (!e || store.mode !== "walk") return;
    const c = { x: e.x + Math.sin(e.rotY) * 0.5, z: e.z + Math.cos(e.rotY) * 0.5 };
    const close = Math.hypot(c.x - store.pos.x, c.z - store.pos.z) < 3.4;
    // Seated, or already close: show its details right where you are.
    if (close || store.seat) { setSelected(e); audio.chime(); return; }
    // Otherwise walk to its viewing spot (around benches and sculptures),
    // turn to face it, then show its details.
    if (store.navigate?.({ x: e.spawn.x, z: e.spawn.z })) {
      store.targetExhibit = e.id;
      store.targetSeat = null;
      store.targetYaw = yawToward(e.spawn, e);
      store.targetPitch = 0;
    } else { setSelected(e); audio.chime(); }
  }, [content, store, audio]);

  const onFloorClick = useCallback((x: number, z: number) => {
    if (store.mode !== "walk") return;
    store.targetExhibit = null;
    store.targetSeat = null;
    if (store.seat) { store.seat = null; store.onSeatChange?.(null); }
    const d = content.doors.find((d) => d.roomId === store.roomId && Math.hypot(d.x - x, d.z - z) < 1.8);
    if (d) {
      // Walk up to the doorway, then straight through it.
      const out = { left: [-1, 0], right: [1, 0], front: [0, -1], back: [0, 1] }[d.side];
      if (store.navigate?.({ x: d.x - out[0] * 0.6, z: d.z - out[1] * 0.6 })) store.path.push({ x: d.x + out[0], z: d.z + out[1] });
      else store.target = { x: d.x + out[0], z: d.z + out[1] };
      if (store.path.length) store.destination = { x: d.x, z: d.z };
    } else store.navigate?.({ x, z });
  }, [content, store]);

  const toggleMouseLook = useCallback(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".world-canvas canvas");
    if (document.pointerLockElement) { document.exitPointerLock(); return; }
    if (!canvas?.requestPointerLock) return;
    try {
      const r = canvas.requestPointerLock() as unknown;
      if (r instanceof Promise) r.catch(() => {});
    } catch { /* not allowed here (e.g. in a sandboxed frame) */ }
  }, []);
  useEffect(() => {
    const change = () => {
      const on = !!document.pointerLockElement;
      store.pointerLocked = on;
      setMouseLook(on);
      if (!on) store.targetPitch = Math.max(-0.6, Math.min(0.45, store.targetPitch));
    };
    document.addEventListener("pointerlockchange", change);
    return () => document.removeEventListener("pointerlockchange", change);
  }, [store]);

  // Walking well away from the artwork you clicked puts its card away.
  useEffect(() => {
    if (!selected) return;
    const id = window.setInterval(() => {
      const c = { x: selected.x, z: selected.z };
      if (Math.hypot(c.x - store.pos.x, c.z - store.pos.z) > 7.5 || store.roomId !== selected.roomId) setSelected(null);
    }, 300);
    return () => clearInterval(id);
  }, [selected, store]);

  // --- keyboard -------------------------------------------------------------------------
  useEffect(() => {
    const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (openSlug) { if (e.key === "Escape" || e.key === "Backspace") { e.preventDefault(); closeExhibit(); } return; }
      if (mapOpen || shelfOpen || checkout || !entered) return;
      // W A S D only; the arrow keys are left alone (for scrolling and screen readers).
      const move = ["KeyW", "KeyA", "KeyS", "KeyD"];
      if (move.includes(e.code)) { store.keys.add(e.code); e.preventDefault(); return; }
      if (e.code === "Escape" && selected) { e.preventDefault(); setSelected(null); return; }
      if (e.code === "KeyL") { e.preventDefault(); toggleMouseLook(); return; }
      if (e.code === "KeyT" && net.status !== "off") {
        e.preventDefault();
        if (document.pointerLockElement) document.exitPointerLock();
        setChatOpen(true);
        return;
      }
      if (e.code === "KeyM") { e.preventDefault(); setMapOpen(true); return; }
      if (e.code === "KeyV") { e.preventDefault(); toggleView(); return; }
      const focus = selected ?? store.nearby;
      if (e.code === "KeyC" && focus) { e.preventDefault(); collection.toggle(focus.slug); return; }
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      // E (or Enter) is an explicit "interact": step into the artwork you're looking at.
      if (e.code === "KeyE" || (e.key === "Enter" && !onButton)) {
        if (focus) { e.preventDefault(); openExhibit(focus); }
        else if (store.nearMap) { e.preventDefault(); setMapOpen(true); }
      }
    };
    const up = (e: KeyboardEvent) => store.keys.delete(e.code);
    const blur = () => store.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [store, openSlug, mapOpen, shelfOpen, checkout, entered, closeExhibit, openExhibit, selected, toggleMouseLook, net]);

  useEffect(() => {
    const paused = mapOpen || shelfOpen || !!checkout;
    if (paused) {
      store.keys.clear(); store.joy = { x: 0, y: 0 };
      if (store.mode === "walk") store.mode = "transition";
      if (document.pointerLockElement) document.exitPointerLock();
    }
    else if (store.mode === "transition" && wash.phase === "idle" && !veil && entered && !openSlug) store.mode = "walk";
  }, [mapOpen, shelfOpen, checkout, store, wash.phase, veil, entered, openSlug]);

  // --- keyboard focus ----------------------------------------------------------------
  // The world takes focus as soon as you're in, and gets it back whenever an
  // overlay closes, so the walking keys work without clicking first (also
  // when the gallery is embedded in another page).
  const worldEl = useRef<HTMLDivElement>(null);
  const focusWorld = useCallback(() => {
    requestAnimationFrame(() => {
      try { window.focus(); } catch { /* cross-origin parent */ }
      worldEl.current?.focus({ preventScroll: true });
    });
  }, []);
  useEffect(() => {
    if (entered && !openSlug && !mapOpen && !shelfOpen && !checkout) focusWorld();
  }, [entered, openSlug, mapOpen, shelfOpen, checkout, focusWorld]);

  // --- entering the gallery -----------------------------------------------------------
  // With live features on, entering goes through the waiting line (it lets
  // you straight in when there's room). Sound starts on the click itself,
  // since browsers only allow audio from a direct gesture.
  const [entryRequested, setEntryRequested] = useState(false);
  const finishEntering = useCallback(() => {
    setEntryRequested(false);
    setEntered(true);
    store.mode = "walk";
    focusWorld();
    setHint(true);
    later(() => setHint(false), 12000);
    persist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, focusWorld, persist]);
  const enterGallery = async (withSound: boolean) => {
    if (withSound) { await audio.enable(); setSound(true); }
    if (multiplayerEnabled()) setEntryRequested(true);
    else finishEntering();
  };

  const toggleSound = async () => {
    if (audio.muted) { await audio.enable(); setSound(true); }
    else { audio.disable(); setSound(false); }
    persist();
  };

  const toggleView = () => {
    // Read from the store so the V shortcut never acts on a stale value.
    const next = store.view === "third" ? "first" : "third";
    setView(next);
    store.view = next;
    store.bodyYaw = store.yaw;
    store.targetPitch = 0;
    try { localStorage.setItem("osg:view", next); } catch { /* storage unavailable */ }
    setHint(true);
    later(() => setHint(false), 8000);
  };

  const switchLanguage = () => {
    persist();
    const other: Locale = locale === "en" ? "ar" : "en";
    const path = window.location.pathname.replace(/^\/(en|ar)/, `/${other}`);
    router.push(path + window.location.search);
  };

  // --- background preparation (starts as soon as the entrance is interactive) ----
  // Only the room you're in and the rooms you can walk to from it are painted
  // ahead of time; everything else is released and painted again on demand.
  useEffect(() => {
    if (!ready) return;
    if (!queue) {
      // One background connection on phones and small devices, two elsewhere.
      const constrained = window.matchMedia("(pointer: coarse)").matches || (navigator.hardwareConcurrency ?? 8) <= 4;
      queue = new PrefetchQueue(constrained ? 1 : 2);
      const other = locale === "en" ? "ar" : "en";
      queue.add([
        ...STATIC_ASSETS.map((a) => ({ key: `asset:${a.key}`, group: "assets" as const, priority: a.priority, run: () => fetch(a.url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); }) })),
        { key: "route:index", group: "routes", priority: 1, run: async () => router.prefetch(`/${locale}/list`) },
        { key: "route:locale", group: "routes", priority: 1, run: async () => router.prefetch(`/${other}`) },
      ]);
    }
    return queue.subscribe(setPrefetch);
  }, [ready, locale, router]);

  // Progress for what's nearby: "12 of 30 nearby artworks ready".
  const [scope, setScope] = useState<string[]>([]);
  // The room behind the door you're walking toward joins what's prepared.
  const [nearDoor, setNearDoor] = useState<RoomId | null>(null);
  const queuedArt = useRef(new Set<string>());
  useEffect(() => {
    if (!ready || !queue) return;
    // The Main Hall has a door to every room, so there only the two nearest
    // doors (plus any door you walk up to) count as "where you can go".
    const reach = reachableRooms(content, roomId, store.pos).slice(0, 2);
    if (nearDoor && nearDoor !== roomId && !reach.includes(nearDoor) && content.doors.some((d) => d.roomId === roomId && d.to === nearDoor)) reach.push(nearDoor);
    const nearby = [roomId, ...reach];
    const slugs = new Set<string>();
    const tasks: Parameters<PrefetchQueue["add"]>[0] = [];
    nearby.forEach((rid, distance) => {
      for (const p of projectsShownIn(content, rid)) {
        if (slugs.has(p.slug)) continue;
        slugs.add(p.slug);
        const key = `art:${rid}:${p.slug}`;
        if (queuedArt.current.has(p.slug) && isArtworkReady(p.slug)) continue;
        queuedArt.current.add(p.slug);
        tasks.push({ key, group: "artworks", priority: 2 + distance * 0.1, run: () => artworkUrl(p, roomFor(content, p), { background: true }) });
      }
    });
    // Forget rooms you can no longer walk to, then queue what's nearby.
    queue.retain((t) => t.group !== "artworks" || slugs.has(t.key.split(":")[2]));
    for (const slug of [...queuedArt.current]) if (!slugs.has(slug)) queuedArt.current.delete(slug);
    releaseArtworks(slugs);
    queue.add(tasks);
    setScope([...slugs]);
  }, [ready, roomId, content, store, nearDoor]);

  const scopeReady = scope.filter((s) => isArtworkReady(s)).length;

  // --- render --------------------------------------------------------------------------
  const selectedProject = selected ? content.projects.find((p) => p.slug === selected.slug) : null;
  const showHud = entered && !openSlug;

  return (
    <div className="gallery" dir={dirOf(locale)} data-reduced={reduced || undefined}>
      <a className="skip-link" href={`/${locale}/list`}>{ui.skipToIndex}</a>

      <div
        ref={worldEl}
        className="world"
        aria-hidden={!!openSlug}
        tabIndex={-1}
        role="application"
        aria-label={`${room.t[locale].title}. ${view === "third" ? ui.controlsSide : touch ? ui.controlsTouch : ui.controlsDesktop}`}
        onPointerDown={() => worldEl.current?.focus({ preventScroll: true })}
      >
        {webgl ? (
          <World
            content={content}
            locale={locale}
            roomId={roomId}
            store={store}
            net={net}
            onChatWith={onChatWith}
            onReady={() => setReady(true)}
            onExhibitClick={onExhibitClick}
            onFloorClick={onFloorClick}
            onMapRoom={teleportToRoom}
          />
        ) : (
          <div className="no-webgl">
            <p>{ui.noWebgl}</p>
            <Link className="btn btn-primary" href={`/${locale}/list`}>{ui.index}</Link>
          </div>
        )}
      </div>

      {/* Painterly full-screen wash used for entering artworks and teleporting. */}
      <div className={`wash-wrap${reduced ? " is-reduced" : ""}`} aria-hidden="true">
        <div className={`wash wash-${wash.kind} is-${wash.phase}`} style={{ ["--wash" as string]: wash.color }} />
      </div>

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
            <button type="button" className="btn btn-glass hud-collection" onClick={() => setShelfOpen(true)}>
              <span aria-hidden="true">✦</span> {ui.collectionButton(collected.length)}
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
            {(
              <button type="button" className="btn btn-glass" onClick={toggleView} aria-pressed={view === "third"} aria-keyshortcuts="V">
                {view === "third" ? ui.viewFirst : ui.viewSide}
              </button>
            )}
            {!touch && (
              <button type="button" className="btn btn-glass" onClick={toggleMouseLook} aria-pressed={mouseLook} aria-keyshortcuts="L">
                {ui.mouseLook}
              </button>
            )}
            <Link className="btn btn-glass" href={`/${locale}/list`}>{ui.index}</Link>
          </nav>
        </header>
      )}

      {showHud && (
        <div className="hud-bottom">
          <div className="nearby" aria-live="polite">
            {!selectedProject && nearMap && (
              <button type="button" className="hint-chip" key="map" onClick={() => setMapOpen(true)} aria-keyshortcuts="E">
                {!touch && <span className="kbd kbd-dark" aria-hidden="true">E</span>} {ui.openMap}
              </button>
            )}
            {selectedProject && selected && (
              <div className="nearby-card" key={selected.id} role="dialog" aria-label={selectedProject.title}>
                <button type="button" className="card-close" onClick={() => setSelected(null)} aria-label={ui.close}>×</button>
                <p className="nearby-title"><bdi>{selectedProject.title}</bdi></p>
                <p className="nearby-line">{selectedProject.t[locale]?.oneLine}</p>
                <div className="nearby-actions">
                  <button type="button" className="btn btn-primary" onClick={() => openExhibit(selected)} aria-keyshortcuts="E">
                    {ui.enterArtwork}
                    {!touch && <span className="kbd" aria-hidden="true">E</span>}
                  </button>
                  <CollectButton slug={selectedProject.slug} locale={locale} />
                </div>
                {selectedProject.comingSoon && <p className="placard-soon">{ui.comingSoon}</p>}
              </div>
            )}
          </div>
          {hint && (
            <p className="controls-hint" role="note">{view === "third" ? ui.controlsSide : touch ? ui.controlsTouch : ui.controlsDesktop}</p>
          )}
        </div>
      )}

      {showHud && touch && !mapOpen && <Joystick store={store} label={ui.joystick} />}
      {showHud && mouseLook && <div className="crosshair" aria-hidden="true" />}
      {showHud && mouseLook && hint && <p className="mouse-look-hint" role="note">{ui.mouseLookHint}</p>}
      {showHud && seated && <p className="seated-hint" role="status">{touch ? ui.seatedTouch : ui.seatedDesktop}</p>}

      {veil && (() => {
        const dest = content.rooms.find((r) => r.id === veil.to)!;
        const a = ATMOSPHERE[veil.to];
        return (
          <ViewTransition enter="veil-in" exit="veil-out">
            <div
              className={`teleport-veil${!supportsViewTransitions() ? (veil.leaving ? " is-css-out" : " is-css-in") : ""}`}
              style={{ ["--zenith" as string]: a.zenith, ["--horizon" as string]: a.horizon, ["--glow" as string]: a.glow, ["--deep" as string]: a.monument }}
              role="status"
              aria-live="polite"
            >
              <div className="veil-sun" aria-hidden="true" />
              <div className="veil-hills" aria-hidden="true" />
              <div className="veil-petals" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <span key={i} style={{ ["--i" as string]: i }} />)}</div>
              <div className="veil-text">
                <p className="veil-eyebrow">{ui.travellingTo}</p>
                <p className="veil-title">{dest.t[locale].title}</p>
                <p className="veil-sub">{dest.t[locale].subtitle}</p>
                <svg className="veil-stroke" viewBox="0 0 400 24" aria-hidden="true"><path d="M8 14 C 90 2, 180 22, 260 10 S 370 8, 392 12" /></svg>
              </div>
            </div>
          </ViewTransition>
        );
      })()}

      {prefetch && entered && !openSlug && scope.length > 0 && !(scopeReady === scope.length && !hint) && (
        <p className="prefetch" aria-live="off">
          {scopeReady === scope.length ? ui.prefetchDone : ui.prefetch(scopeReady, scope.length)}
          {prefetch.paused && !prefetch.finished && (
            <> · {ui.prefetchPaused} <button type="button" className="link" onClick={() => queue?.resume()}>{ui.resume}</button></>
          )}
        </p>
      )}

      {!entered && !entryRequested && (
        <div className="arrival" role="dialog" aria-modal="true" aria-labelledby="arrival-title">
          <div className="arrival-card">
            <button type="button" className="btn btn-quiet arrival-lang" onClick={switchLanguage} aria-label={ui.languageLabel} lang={locale === "en" ? "ar" : "en"}>
              {ui.language}
            </button>
            <h1 id="arrival-title" className="arrival-title">{ui.siteTitle}</h1>
            <p className="arrival-tagline">{ui.tagline}</p>
            <div className="arrival-actions">
              <button type="button" className="btn btn-primary btn-large" autoFocus onClick={() => enterGallery(true)}>{ui.enterSound}</button>
              <button type="button" className="btn btn-large" onClick={() => enterGallery(false)}>{ui.enterQuiet}</button>
            </div>
            <p className="arrival-meta muted">
              {ready ? (touch ? ui.controlsTouch : ui.controlsDesktop) : ui.loadingWorld}
            </p>
            <Link className="link small" href={`/${locale}/list`}>{ui.index}</Link>
          </div>
        </div>
      )}

      {debug && <PerfOverlay net={net} />}
      <MultiplayerLayer
        net={net}
        store={store}
        content={content}
        locale={locale}
        roomId={roomId}
        entered={entered}
        hud={showHud && !mapOpen && !shelfOpen && !checkout}
        chatOpen={chatOpen && showHud}
        setChatOpen={setChatOpen}
        request={chatRequest}
        onNotify={() => audio.chime()}
        entryRequested={entryRequested}
        onAdmitted={finishEntering}
        onEntryCancelled={() => { setEntryRequested(false); if (!audio.muted) { audio.disable(); setSound(false); } }}
      />

      {shelfOpen && (
        <CollectionShelf
          content={content}
          locale={locale}
          onClose={() => setShelfOpen(false)}
          onCheckout={(slugs) => { setShelfOpen(false); setCheckout(slugs); }}
          onGoTo={(slug) => { setShelfOpen(false); teleportToProject(slug); }}
        />
      )}

      {checkout && (
        <GiftShop content={content} locale={locale} slugs={checkout} onBack={() => { setCheckout(null); setShelfOpen(true); }} />
      )}

      {mapOpen && (
        <MapDialog
          content={content}
          locale={locale}
          currentRoom={roomId}
          net={net}
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
