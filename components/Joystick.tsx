"use client";

import { useRef, useState } from "react";
import type { WorldStore } from "@/lib/worldStore";

/** Soft on-screen stick for walking on touch screens. Look by dragging elsewhere. */
export function Joystick({ store, label }: { store: WorldStore; label: string }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);

  const update = (clientX: number, clientY: number) => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const R = r.width / 2;
    let dx = clientX - (r.left + R), dy = clientY - (r.top + R);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    setKnob({ x: dx, y: dy });
    // Small dead zone, then a gentle curve so slight pushes mean slow strolls.
    const nx = dx / R, ny = -dy / R;
    const m = Math.hypot(nx, ny);
    const k = m < 0.12 ? 0 : Math.pow((m - 0.12) / 0.88, 1.3) / Math.max(m, 1e-3);
    store.joy = { x: nx * k, y: ny * k };
  };
  const end = () => {
    active.current = null;
    setKnob({ x: 0, y: 0 });
    store.joy = { x: 0, y: 0 };
  };

  return (
    <div
      ref={base}
      className="joystick"
      role="img"
      aria-label={label}
      onPointerDown={(e) => {
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => { if (e.pointerId === active.current) update(e.clientX, e.clientY); }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
