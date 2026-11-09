"use client";

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useConvex, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Locale } from "@/content";
import { identityToken, ownerKey } from "@/lib/multiplayer/local";
import { MP } from "@/lib/multiplayer/strings";

// The waiting line shown when the gallery is at capacity. It asks the server
// for a place, shows your position, keeps the place while the tab is open,
// and lets you in when it's your turn. If the live backend fails or is slow,
// it lets you in rather than leaving you stuck (the gallery works without it).

export function QueueGate({ locale, onAdmitted, onCancel }: { locale: Locale; onAdmitted: () => void; onCancel: () => void }) {
  const done = useRef(false);
  const admit = () => { if (!done.current) { done.current = true; onAdmitted(); } };
  return (
    <GateBoundary onError={admit}>
      <Line locale={locale} onAdmitted={admit} onCancel={onCancel} />
    </GateBoundary>
  );
}

class GateBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.warn("[queue] unavailable, letting the visitor in:", err); this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function Line({ locale, onAdmitted, onCancel }: { locale: Locale; onAdmitted: () => void; onCancel: () => void }) {
  const convex = useConvex();
  const t = MP[locale];
  const token = useMemo(identityToken, []);
  const [asked, setAsked] = useState(false);
  const status = useQuery(api.queue.status, asked ? { token } : "skip");
  const info = useQuery(api.queue.capacityInfo, asked ? {} : "skip");
  const card = useRef<HTMLDivElement>(null);

  // Ask for a place; come straight in if there's room. Don't wait long on a slow backend.
  useEffect(() => {
    let alive = true;
    const fallback = window.setTimeout(() => { if (alive && !asked) onAdmitted(); }, 10_000);
    convex.mutation(api.queue.request, { token })
      .then((r) => { if (!alive) return; clearTimeout(fallback); if (r.admitted) onAdmitted(); else setAsked(true); })
      .catch(() => { if (alive) { clearTimeout(fallback); onAdmitted(); } });
    return () => { alive = false; clearTimeout(fallback); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (status?.admitted) onAdmitted(); }, [status, onAdmitted]);

  // Keep the place while the tab is open.
  useEffect(() => {
    if (!asked) return;
    const id = window.setInterval(() => { void convex.mutation(api.queue.ping, { token }).catch(() => {}); }, 20_000);
    return () => clearInterval(id);
  }, [asked, convex, token]);

  // ⌘⇧O / Ctrl+Shift+O: move 5 places forward; add ⌥/Alt to skip the whole line.
  // Needs the owner key in this browser and is checked by the server;
  // without it the keys do nothing at all.
  useEffect(() => {
    if (!asked) return;
    const key = (e: KeyboardEvent) => {
      if (e.code !== "KeyO" || !e.shiftKey || !(e.metaKey || e.ctrlKey)) return;
      const secret = ownerKey();
      if (!secret) return;
      e.preventDefault();
      void convex.mutation(api.queue.skip, { token, key: secret, all: e.altKey }).then((r) => { if (new URLSearchParams(location.search).has("debug")) console.info("[queue] skip", r); }).catch(() => {});
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [asked, convex, token]);

  useEffect(() => { if (asked) card.current?.focus(); }, [asked]);

  if (!asked) return <div className="arrival queue" role="status"><div className="arrival-card"><p className="arrival-meta">{t.queueJoining}</p></div></div>;
  return (
    <div className="arrival queue" role="dialog" aria-modal="true" aria-labelledby="queue-title">
      <div className="arrival-card" ref={card} tabIndex={-1}>
        <h1 id="queue-title" className="arrival-title queue-title">{t.queueTitle}</h1>
        <p className="queue-position" aria-live="polite">{status ? t.queuePosition(status.position) : "…"}</p>
        {info && <p className="muted small">{t.queueWaiting(info.waiting)}</p>}
        <div className="queue-dots" aria-hidden="true"><span /><span /><span /></div>
        <p className="arrival-tagline">{t.queueBody}</p>
        <div className="arrival-actions">
          <Link className="btn btn-primary" href={`/${locale}/list`}>{t.queueMeanwhile}</Link>
          <button type="button" className="btn" onClick={() => { void convex.mutation(api.queue.leaveLine, { token }).catch(() => {}); onCancel(); }}>{t.queueLeave}</button>
        </div>
      </div>
    </div>
  );
}
