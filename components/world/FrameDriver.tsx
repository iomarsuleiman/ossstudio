"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { WorldStore } from "@/lib/worldStore";
import type { QualitySettings } from "@/lib/quality";

// Renders on demand instead of a constant 60 fps loop:
// - every frame while you move, look, glide, sit, a transition plays or
//   other visitors walk nearby;
// - a gentle ~12 fps for a few seconds after you stop (water and petals
//   settle), then nothing at all until something changes: a still gallery
//   costs no GPU time and no battery;
// - nothing while an exhibit page covers the world or the tab is hidden.
// It also adapts the pixel ratio to measured frame times: down quickly when
// frames run long, back up slowly (with a cooldown) when there's headroom,
// so quality never flickers.

let lastInput = 0;
if (typeof window !== "undefined") {
  const mark = () => { lastInput = performance.now(); };
  ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"].forEach((t) => window.addEventListener(t, mark, { passive: true }));
}

const IDLE_DRAW_MS = 3000;

export function FrameDriver({ store, quality }: { store: WorldStore; quality: QualitySettings }) {
  const { invalidate, setDpr, gl } = useThree();

  useEffect(() => {
    // Don't render 3× pixels just because the screen is dense (tiers cap it).
    const { maxDpr, minDpr } = quality;
    let dpr = maxDpr;
    let goodWindows = 0;
    let lastChange = 0;
    let lastBusy = performance.now();
    setDpr(dpr);
    let raf = 0;
    let lastIdle = 0;
    let lastFrame = performance.now();
    const samples: number[] = [];

    const busy = () => {
      const s = store;
      if (s.mode === "entering" || s.mode === "exiting" || s.mode === "transition") return true;
      if (s.enter > 0 && s.enter < 1) return true;
      if (Math.hypot(s.vel.x, s.vel.z) > 0.01 || s.keys.size || s.joy.x || s.joy.y || s.target || s.targetSeat) return true;
      if (s.sitBlend !== (s.seat ? 1 : 0)) return true;
      if (s.remoteActive) return true;
      if (Math.abs(s.targetYaw - s.yaw) > 1e-3 || Math.abs(s.targetPitch - s.pitch) > 1e-3) return true;
      if (Math.abs(s.viewBlend - (s.view === "third" ? 1 : 0)) > 1e-3) return true;
      return performance.now() - lastInput < 1200;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      // An exhibit page fully covers the world: no need to draw it.
      if (store.mode === "exhibit" && store.enter >= 1) return;
      if (busy() || store.remoteActive) {
        lastBusy = now;
        invalidate();
        const dt = now - lastFrame;
        lastFrame = now;
        if (dt < 200) {
          samples.push(dt);
          if (samples.length >= 90) {
            const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
            samples.length = 0;
            // Down at once when frames run long; up only after two good
            // windows in a row and a few seconds since the last change.
            let next = dpr;
            if (avg > 22) { next = Math.max(minDpr, dpr - 0.25); goodWindows = 0; }
            else if (avg < 14) { goodWindows++; if (goodWindows >= 2 && now - lastChange > 4000) { next = Math.min(maxDpr, dpr + 0.125); goodWindows = 0; } }
            else goodWindows = 0;
            if (next !== dpr) { dpr = next; lastChange = now; setDpr(dpr); }
          }
        }
      } else {
        lastFrame = now;
        // Let the scene settle for a moment, then stop drawing entirely.
        if (now - lastBusy > IDLE_DRAW_MS) return;
        const interval = store.reducedMotion ? 250 : 80;
        if (now - lastIdle > interval) { lastIdle = now; invalidate(); }
      }
    };
    raf = requestAnimationFrame(tick);

    // Recover gracefully if the browser drops the GPU context (e.g. after sleep).
    const canvas = gl.domElement;
    const lost = (e: Event) => e.preventDefault();
    const restored = () => invalidate();
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    };
  }, [store, invalidate, setDpr, gl, quality]);

  return null;
}
