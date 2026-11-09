"use client";

import { useEffect, useState } from "react";
import type { NetStore } from "@/lib/multiplayer/net";

// `?debug` only: frame rate and live-traffic numbers, for load tests and
// for checking how the gallery copes with a crowded room. Also published as
// window.__perf so automated tests can read it.

export function PerfOverlay({ net }: { net: NetStore }) {
  const [stats, setStats] = useState({ fps: 0, worst: 0, remotes: 0, updates: 0, kb: 0, status: net.status, delay: 0 });
  useEffect(() => {
    let frames = 0, worst = 0, last = performance.now(), raf = 0, prev = last;
    const frame = (now: number) => {
      frames++;
      worst = Math.max(worst, now - prev);
      prev = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const id = window.setInterval(() => {
      const now = performance.now();
      const s = {
        fps: Math.round((frames * 1000) / (now - last)),
        worst: Math.round(worst),
        remotes: net.remotes.size,
        updates: net.stats.lastSecondUpdates,
        kb: Math.round(net.stats.lastSecondBytes / 102.4) / 10,
        status: net.status,
        delay: Math.round(net.delay),
      };
      frames = 0; worst = 0; last = now;
      (window as unknown as { __perf: typeof s }).__perf = s;
      setStats(s);
    }, 1000);
    return () => { cancelAnimationFrame(raf); clearInterval(id); };
  }, [net]);
  return (
    <pre className="perf-overlay" aria-hidden="true">
      {`${stats.fps} fps (worst frame ${stats.worst} ms)\n${stats.remotes} others in room · ${stats.status}\n${stats.updates} room updates/s · ${stats.kb} KB/s\ndrawn ${stats.delay} ms behind`}
    </pre>
  );
}
