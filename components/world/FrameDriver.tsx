"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { WorldStore } from "@/lib/worldStore";

// Renders on demand instead of a constant 60 fps loop:
// - every frame while you move, look, glide or a transition plays;
// - a gentle ~12 fps while standing still (water, petals keep drifting);
// - nothing while an exhibit page covers the world or the tab is hidden.
// It also adapts the pixel ratio to keep frame pacing steady.

let lastInput = 0;
if (typeof window !== "undefined") {
  const mark = () => { lastInput = performance.now(); };
  ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"].forEach((t) => window.addEventListener(t, mark, { passive: true }));
}

export function FrameDriver({ store }: { store: WorldStore }) {
  const { invalidate, setDpr, gl } = useThree();

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    // Don't render 3× pixels just because the screen is dense.
    const maxDpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 1.75);
    const minDpr = 0.75;
    let dpr = maxDpr;
    setDpr(dpr);
    let raf = 0;
    let lastIdle = 0;
    let lastFrame = performance.now();
    const samples: number[] = [];

    const busy = () => {
      const s = store;
      if (s.mode === "entering" || s.mode === "exiting" || s.mode === "transition") return true;
      if (s.enter > 0 && s.enter < 1) return true;
      if (Math.hypot(s.vel.x, s.vel.z) > 0.01 || s.keys.size || s.joy.x || s.joy.y || s.target) return true;
      if (Math.abs(s.targetYaw - s.yaw) > 1e-3 || Math.abs(s.targetPitch - s.pitch) > 1e-3) return true;
      if (Math.abs(s.viewBlend - (s.view === "side" ? 1 : 0)) > 1e-3) return true;
      return performance.now() - lastInput < 1200;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      // An exhibit page fully covers the world: no need to draw it.
      if (store.mode === "exhibit" && store.enter >= 1) return;
      if (busy()) {
        invalidate();
        const dt = now - lastFrame;
        lastFrame = now;
        if (dt < 200) {
          samples.push(dt);
          if (samples.length >= 90) {
            const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
            samples.length = 0;
            const next = avg > 24 ? Math.max(minDpr, dpr - 0.25) : avg < 15 ? Math.min(maxDpr, dpr + 0.25) : dpr;
            if (next !== dpr) { dpr = next; setDpr(dpr); }
          }
        }
      } else {
        lastFrame = now;
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
  }, [store, invalidate, setDpr, gl]);

  return null;
}
