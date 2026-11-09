"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ConvexProvider, ConvexReactClient, useConvex, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { GalleryContent, Locale, RoomId } from "@/content";
import type { NetStore, RemoteRow } from "@/lib/multiplayer/net";
import { identityToken, mutes } from "@/lib/multiplayer/local";
import { MP } from "@/lib/multiplayer/strings";
import type { WorldStore } from "@/lib/worldStore";
import { DevClient } from "@/lib/multiplayer/devClient";
import { ChatPanel, type ChatTab } from "./ChatPanel";

// Everything live: presence, avatars' data, chats and private messages. It is
// optional and isolated: without NEXT_PUBLIC_CONVEX_URL it renders nothing,
// and if Convex fails or is overloaded the error boundary and back-off below
// switch live features off while the gallery itself keeps working.

let client: ConvexReactClient | null | undefined;
function getClient() {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const dev = process.env.NEXT_PUBLIC_MP_DEV;
  try {
    // NEXT_PUBLIC_MP_DEV points at scripts/dev-backend.ts for local testing.
    client = dev ? (new DevClient(dev) as unknown as ConvexReactClient) : url ? new ConvexReactClient(url, { unsavedChangesWarning: false }) : null;
  } catch {
    client = null;
  }
  return client;
}

export interface ChatRequest { tab: ChatTab; with?: string; nonce: number }

export interface MultiplayerProps {
  net: NetStore;
  store: WorldStore;
  content: GalleryContent;
  locale: Locale;
  roomId: RoomId;
  entered: boolean;
  /** HUD visible (not behind an exhibit page or overlay). */
  hud: boolean;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  request: ChatRequest | null;
  onNotify?: () => void;
}

export function MultiplayerLayer(props: MultiplayerProps) {
  const c = useMemo(getClient, []);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (!c) props.net.setStatus("off"); }, [c, props.net]);
  if (!c) return null;
  return (
    <ConvexProvider client={c}>
      <LiveBoundary key={attempt} net={props.net} locale={props.locale} onRetry={() => setAttempt((n) => n + 1)}>
        <Live {...props} />
      </LiveBoundary>
    </ConvexProvider>
  );
}

/** If anything live throws, show a quiet note, keep the gallery running, and try again later. */
class LiveBoundary extends Component<{ net: NetStore; locale: Locale; onRetry: () => void; children: ReactNode }, { failed: boolean; hidden: boolean }> {
  state = { failed: false, hidden: false };
  private timer = 0;
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) {
    console.warn("[multiplayer] live features paused:", err);
    this.props.net.clear();
    this.props.net.setMe(null);
    this.props.net.setStatus("offline");
    this.timer = window.setTimeout(() => this.props.onRetry(), 30_000);
  }
  componentWillUnmount() { clearTimeout(this.timer); }
  render() {
    if (!this.state.failed) return this.props.children;
    if (this.state.hidden) return null;
    const t = MP[this.props.locale];
    return (
      <div className="live-note" role="status">
        {t.liveUnavailable}
        <button type="button" className="card-close" onClick={() => this.setState({ hidden: true })} aria-label={t.close}>×</button>
      </div>
    );
  }
}

type Me = { id: string; name: string; color: string; allowDMs: boolean };

function Live({ net, store, content, locale, roomId, entered, hud, chatOpen, setChatOpen, request, onNotify }: MultiplayerProps) {
  const convex = useConvex();
  const t = MP[locale];
  const token = useMemo(identityToken, []);
  const [me, setMe] = useState<Me | null>(null);
  const interval = useRef(250);
  const joinedRoom = useRef<RoomId | null>(null);

  // --- joining and changing rooms ------------------------------------------------------
  const join = useCallback(async () => {
    net.setStatus("connecting");
    const r = await convex.mutation(api.presence.join, { token, roomId: store.roomId, x: store.pos.x, z: store.pos.z, yaw: store.yaw });
    interval.current = r.interval;
    joinedRoom.current = store.roomId;
    const m = { id: r.visitorId, name: r.name, color: r.color, allowDMs: r.allowDMs };
    setMe(m);
    net.setMe(m);
    net.setStatus("live");
    return m;
  }, [convex, token, store, net]);

  useEffect(() => {
    if (!entered) return;
    join().catch(() => net.setStatus("offline"));
  }, [entered, join, net]);

  useEffect(() => {
    if (!me || joinedRoom.current === roomId) return;
    joinedRoom.current = roomId;
    net.clear();
    convex.mutation(api.presence.changeRoom, { token, roomId, x: store.pos.x, z: store.pos.z, yaw: store.yaw })
      .then((r) => { interval.current = r.interval; })
      .catch(() => {});
  }, [roomId, me, convex, token, store, net]);

  // Say goodbye when the tab closes (the server sweeps anyone who can't).
  useEffect(() => {
    const bye = () => { void convex.mutation(api.presence.leave, { token }).catch(() => {}); };
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, [convex, token]);

  // --- sending movement --------------------------------------------------------------------
  // Throttled to the rate the server recommends for this room's crowd, only
  // when something changed (plus a heartbeat), never more than one in flight
  // (back-pressure), with exponential back-off when the server struggles.
  useEffect(() => {
    if (!me) return;
    let last = { x: NaN, z: NaN, yaw: NaN, moving: false, at: 0 };
    let inFlight = false;
    let backoffUntil = 0;
    let failures = 0;
    let sentSeat: string | null = null;
    const id = window.setInterval(() => {
      const now = performance.now();
      if (inFlight || now < backoffUntil || store.mode === "transition" || joinedRoom.current !== store.roomId) return;

      // Standing up is synced here (sitting down goes through onSitRequest).
      const seat = store.seat ? `${store.seat.bench}:${store.seat.seat}` : null;
      if (seat === null && sentSeat !== null) {
        const was = sentSeat;
        inFlight = true;
        convex.mutation(api.presence.sit, { token, seat: null })
          .then(() => { if (sentSeat === was) sentSeat = null; })
          .catch(() => {})
          .finally(() => { inFlight = false; });
        return;
      }

      const moving = Math.hypot(store.vel.x, store.vel.z) > 0.05;
      const changed = Math.hypot(store.pos.x - last.x, store.pos.z - last.z) > 0.12 || Math.abs(store.yaw - last.yaw) > 0.12 || moving !== last.moving;
      const due = now - last.at >= (changed ? interval.current : 15_000);
      if (!due || !(changed || now - last.at >= 15_000)) return;
      const sent = { x: store.pos.x, z: store.pos.z, yaw: store.yaw, moving, at: now };
      inFlight = true;
      const t0 = performance.now();
      convex.mutation(api.presence.move, { token, x: sent.x, z: sent.z, yaw: sent.yaw, moving })
        .then(async (r) => {
          last = sent;
          failures = 0;
          const latency = performance.now() - t0;
          // Slow round trips mean the backend is under load: send less.
          if (latency > 1500) { net.setStatus("busy"); interval.current = Math.max(interval.current, 1500); }
          else if (net.status === "busy" && latency < 400) net.setStatus("live");
          if (r.rejoin) await join();
        })
        .catch(() => {
          failures++;
          backoffUntil = performance.now() + Math.min(30_000, 1000 * 2 ** failures);
          if (failures >= 3) net.setStatus("busy");
        })
        .finally(() => { inFlight = false; });
    }, 100);
    // Sitting down asks the server first, so two people can't share a seat.
    store.onSitRequest = async (bench, seatIndex) => {
      const key = `${bench}:${seatIndex}`;
      const timeout = new Promise<boolean>((r) => setTimeout(() => r(true), 1500));
      const ask = convex.mutation(api.presence.sit, { token, seat: key }).then((r) => { if (r.ok) sentSeat = key; return r.ok; }).catch(() => true);
      return Promise.race([ask, timeout]);
    };
    return () => { clearInterval(id); store.onSitRequest = undefined; };
  }, [me, convex, token, store, net, join]);

  // Connection watch: show "offline" when the socket is down for a while.
  useEffect(() => {
    if (!me) return;
    let downSince = 0;
    const id = window.setInterval(() => {
      const s = convex.connectionState();
      if (s.isWebSocketConnected) { downSince = 0; if (net.status === "offline" || net.status === "connecting") net.setStatus("live"); }
      else if (!downSince) downSince = Date.now();
      else if (Date.now() - downSince > 4000) net.setStatus("offline");
    }, 1000);
    return () => clearInterval(id);
  }, [me, convex, net]);

  // --- receiving -----------------------------------------------------------------------------
  // The room arrives as the server ticker's compact frame (≤ 2 per second).
  const frame = useQuery(api.presence.frame, me ? { roomId } : "skip");
  useEffect(() => {
    if (!frame || !me) return;
    let parsed: unknown[][] = [];
    try { parsed = JSON.parse(frame.data) as unknown[][]; } catch { return; }
    const rows: RemoteRow[] = parsed.map(([id, n, c, x, z, y, m, s, t, o]) => ({ id: id as string, n: n as string, c: c as string, x: x as number, z: z as number, y: y as number, m: !!m, s: (s as string | null) ?? null, t: t as number, o: !!o }));
    net.ingest(rows, frame.data.length);
    store.takenSeats = new Set(rows.filter((r) => r.id !== me.id && r.s).map((r) => r.s!));
  }, [frame, me, net, store]);

  const counts = useQuery(api.presence.counts, entered ? {} : "skip");
  useEffect(() => { if (counts) net.setCounts(counts); }, [counts, net]);

  const blocks = useQuery(api.dms.myBlocks, me ? { token } : "skip");
  useEffect(() => { if (blocks) net.setHidden(blocks.map((b) => b.id)); }, [blocks, net]);

  // --- private message notifications -------------------------------------------------------
  const convs = useQuery(api.dms.conversations, me ? { token } : "skip");
  const [toast, setToast] = useState<{ conv: string; with: string; name: string } | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const seenAt = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    if (!convs) return;
    const prev = seenAt.current;
    const next = new Map(convs.map((c) => [c.id as string, c.lastAt]));
    seenAt.current = next;
    if (!prev) return; // first load: no toasts for old messages
    for (const c of convs) {
      const before = prev.get(c.id) ?? 0;
      if (c.lastAt > before && !c.lastFromMe && c.unread > 0 && !mutes.has(c.with) && !(chatOpen && viewing === c.id)) {
        setToast({ conv: c.id, with: c.with, name: c.name });
        onNotify?.();
        break;
      }
    }
  }, [convs, chatOpen, viewing, onNotify]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(id);
  }, [toast]);
  const unread = (convs ?? []).filter((c) => !mutes.has(c.with)).reduce((n, c) => n + c.unread, 0);

  // Unread count in the tab title, so it shows even from another tab.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = unread ? `(${unread}) ${base}` : base;
  }, [unread]);

  const [ask, setAsk] = useState<ChatRequest | null>(null);
  useEffect(() => { if (request) setAsk(request); }, [request]);

  const status = useSyncExternalStore(net.subscribe, () => net.status, () => net.status);
  const roomCount = Math.max(1, counts?.rooms[roomId] ?? 1);
  const total = Math.max(roomCount, counts?.total ?? 1);
  const roomTitle = content.rooms.find((r) => r.id === roomId)?.t[locale].title ?? "";

  return (
    <>
      {hud && (
        <div className="live-hud">
          <span className={`live-presence is-${status}`} aria-label={t.presenceLabel(roomCount, total)} title={t.status[status] || undefined}>
            <span className="live-dot" aria-hidden="true" />
            <span aria-hidden="true">{t.here(roomCount)} · {t.inGallery(total)}</span>
          </span>
          <button type="button" className="btn btn-glass live-chat-btn" onClick={() => setChatOpen(!chatOpen)} aria-expanded={chatOpen} aria-keyshortcuts="T">
            {t.chat}
            {unread > 0 && <span className="live-badge" aria-label={t.unread(unread)}>{unread > 9 ? "9+" : unread}</span>}
          </button>
          {(status === "busy" || status === "offline") && <span className="live-status" role="status">{t.status[status]}</span>}
        </div>
      )}
      {toast && hud && !(chatOpen && viewing === toast.conv) && (
        <div className="live-toast" role="status">
          <span>{t.newMessageFrom(toast.name)}</span>
          <button type="button" className="btn btn-small btn-primary" onClick={() => { setAsk({ tab: "messages", with: toast.with, nonce: Date.now() }); setChatOpen(true); setToast(null); }}>{t.open}</button>
          <button type="button" className="card-close" onClick={() => setToast(null)} aria-label={t.dismiss}>×</button>
        </div>
      )}
      {chatOpen && me && (
        <ChatPanel
          token={token}
          me={me}
          setMe={(m) => { setMe(m); net.setMe(m); }}
          locale={locale}
          roomId={roomId}
          roomTitle={roomTitle}
          content={content}
          conversations={convs ?? []}
          blocks={blocks ?? []}
          request={ask}
          onViewing={setViewing}
          onClose={() => setChatOpen(false)}
        />
      )}
    </>
  );
}

export type ConversationSummary = {
  id: Id<"conversations">;
  with: Id<"visitors">;
  name: string;
  color: string;
  online: boolean;
  roomId: string | null;
  lastAt: number;
  lastBody: string;
  lastFromMe: boolean;
  unread: number;
};
