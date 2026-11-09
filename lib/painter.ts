// Procedural painterly artworks drawn with Canvas 2D. Every project gets a
// deterministic painting seeded by its slug. Opening Collection projects get a
// bespoke motif; the rest get a quiet landscape composition. Nothing here is
// copied from third-party art or logos.

import type { Motif, Project, Room } from "@/content";

export const INK = {
  cream: "#f4ead9",
  paper: "#efe3cf",
  rose: "#d8a39e",
  dusty: "#c48a87",
  burgundy: "#86394a",
  wine: "#5e2836",
  sage: "#9aa985",
  moss: "#6e7d5c",
  charcoal: "#3d3737",
  ochre: "#c99a5b",
  dusk: "#7d708f",
  mist: "#dcd3c8",
  teal: "#6f8a86",
};

type Ctx = CanvasRenderingContext2D;

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: string) {
  let a = hash(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function mix(a: string, b: string, t: number) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  // In a worker (artworks are painted off the main thread) there is no DOM:
  // OffscreenCanvas has the same 2D drawing API.
  if (typeof document === "undefined") return new OffscreenCanvas(w, h) as unknown as HTMLCanvasElement;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// --- painterly primitives ----------------------------------------------------

function wash(ctx: Ctx, w: number, h: number, top: string, bottom: string, r: () => number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 7; i++) {
    const x = r() * w, y = r() * h, rad = (0.3 + r() * 0.6) * w;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, rgba(r() > 0.5 ? INK.cream : INK.rose, 0.18));
    rg.addColorStop(1, rgba(INK.cream, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  }
}

function strokes(ctx: Ctx, w: number, h: number, color: string, count: number, r: () => number, alpha = 0.05) {
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    ctx.strokeStyle = rgba(color, alpha * (0.5 + r()));
    ctx.lineWidth = 4 + r() * 22;
    const x = r() * w, y = r() * h, len = 30 + r() * 120, ang = -0.4 + r() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5 + (r() - 0.5) * 20,
      x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
  ctx.restore();
}

function grain(ctx: Ctx, w: number, h: number, r: () => number) {
  ctx.save();
  for (let i = 0; i < (w * h) / 90; i++) {
    ctx.fillStyle = r() > 0.5 ? "rgba(60,40,40,0.035)" : "rgba(255,250,240,0.05)";
    ctx.fillRect(r() * w, r() * h, 1.4, 1.4);
  }
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(70,40,40,0.22)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function soft(ctx: Ctx, blur: number, color: string, fn: () => void) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  fn();
  ctx.restore();
}

function circle(ctx: Ctx, x: number, y: number, rad: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fill();
}

function hills(ctx: Ctx, w: number, h: number, base: number, amp: number, color: string, r: () => number) {
  const f1 = 1 + r() * 2, f2 = 2 + r() * 3, p1 = r() * 6, p2 = r() * 6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 6) {
    const t = x / w;
    ctx.lineTo(x, base + Math.sin(t * Math.PI * f1 + p1) * amp + Math.sin(t * Math.PI * f2 + p2) * amp * 0.35);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

function cypress(ctx: Ctx, x: number, base: number, height: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, base - height);
  ctx.bezierCurveTo(x + height * 0.16, base - height * 0.6, x + height * 0.14, base - height * 0.1, x, base);
  ctx.bezierCurveTo(x - height * 0.14, base - height * 0.1, x - height * 0.16, base - height * 0.6, x, base - height);
  ctx.fill();
}

function arch(ctx: Ctx, x: number, base: number, aw: number, ah: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - aw / 2, base);
  ctx.lineTo(x - aw / 2, base - ah + aw / 2);
  ctx.arc(x, base - ah + aw / 2, aw / 2, Math.PI, 0);
  ctx.lineTo(x + aw / 2, base);
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, rad: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, rad);
  ctx.fill();
}

function figure(ctx: Ctx, x: number, base: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, base - s * 0.8);
  ctx.quadraticCurveTo(x + s * 0.35, base - s * 0.2, x + s * 0.3, base);
  ctx.lineTo(x - s * 0.3, base);
  ctx.quadraticCurveTo(x - s * 0.35, base - s * 0.2, x, base - s * 0.8);
  ctx.fill();
  circle(ctx, x, base - s * 0.92, s * 0.14, color);
}

// --- motifs for the Opening Collection ---------------------------------------

type MotifFn = (ctx: Ctx, w: number, h: number, r: () => number, accent: string, t?: number) => void;

const MOTIFS: Record<Motif, MotifFn> = {
  chess(ctx, w, h, r, accent) {
    hills(ctx, w, h, h * 0.78, 6, rgba(INK.dusty, 0.35), r);
    const s = h * 0.075, ox = w / 2 - s * 4, oy = h * 0.2;
    ctx.save();
    ctx.translate(w / 2, oy + s * 4);
    ctx.transform(1, 0, -0.35, 0.55, 0, 0);
    ctx.translate(-w / 2, -(oy + s * 4));
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      ctx.fillStyle = (i + j) % 2 ? rgba(INK.wine, 0.75) : rgba(INK.cream, 0.9);
      ctx.fillRect(ox + i * s, oy + j * s * 1.4, s, s * 1.4);
    }
    ctx.restore();
    // Evaluation line drifting across the board.
    ctx.strokeStyle = rgba(accent, 0.9);
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = w * 0.1; x < w * 0.9; x += 8) {
      const y = h * 0.84 + Math.sin(x * 0.03 + r() * 0.4) * 10 - (x / w) * 24;
      x === w * 0.1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    // A tall piece silhouette.
    ctx.fillStyle = INK.charcoal;
    const kx = w * 0.72, kb = h * 0.62;
    ctx.beginPath();
    ctx.moveTo(kx - 22, kb); ctx.lineTo(kx + 22, kb); ctx.lineTo(kx + 12, kb - 20);
    ctx.lineTo(kx + 8, kb - 70); ctx.lineTo(kx + 16, kb - 80); ctx.lineTo(kx - 16, kb - 80);
    ctx.lineTo(kx - 8, kb - 70); ctx.lineTo(kx - 12, kb - 20); ctx.closePath(); ctx.fill();
    ctx.fillRect(kx - 3, kb - 102, 6, 20); ctx.fillRect(kx - 10, kb - 96, 20, 6);
  },
  workbench(ctx, w, h, r, accent) {
    for (let i = 0; i < 3; i++) {
      const x = w * (0.2 + i * 0.3), y = h * (0.35 + i * 0.08);
      roundRect(ctx, x - w * 0.12, y, w * 0.24, h * 0.3, 10, rgba(i === 1 ? accent : INK.dusk, 0.55));
      for (let l = 0; l < 5; l++) roundRect(ctx, x - w * 0.09, y + 18 + l * 16, w * (0.06 + r() * 0.12), 6, 3, rgba(INK.cream, 0.8));
      ctx.fillStyle = rgba(INK.charcoal, 0.7);
      ctx.fillRect(x - w * 0.14, y + h * 0.3, w * 0.28, 8);
      ctx.fillRect(x - w * 0.12, y + h * 0.3, 6, h * 0.2);
      ctx.fillRect(x + w * 0.11, y + h * 0.3, 6, h * 0.2);
    }
    ctx.strokeStyle = rgba(accent, 0.6); ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.moveTo(w * 0.2, h * 0.3); ctx.bezierCurveTo(w * 0.4, h * 0.1, w * 0.6, h * 0.1, w * 0.8, h * 0.4); ctx.stroke();
    ctx.setLineDash([]);
  },
  voice(ctx, w, h, r, accent) {
    const mx = w * 0.3, my = h * 0.5;
    roundRect(ctx, mx - 22, my - 60, 44, 90, 22, INK.charcoal);
    ctx.strokeStyle = INK.charcoal; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(mx, my, 40, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    ctx.fillRect(mx - 3, my + 40, 6, 40); ctx.fillRect(mx - 26, my + 78, 52, 6);
    const letters = "a e o i s t r n h l";
    ctx.font = `italic ${Math.round(h * 0.07)}px Georgia, serif`;
    letters.split(" ").forEach((ch, i) => {
      const t = i / 9;
      const x = mx + 60 + t * w * 0.55, y = my - 30 - Math.sin(t * Math.PI) * h * 0.25 + (r() - 0.5) * 20;
      ctx.fillStyle = rgba(i % 2 ? accent : INK.wine, 0.4 + t * 0.5);
      ctx.fillText(ch, x, y);
    });
    for (let i = 1; i < 4; i++) {
      ctx.strokeStyle = rgba(accent, 0.4 / i); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, my - 15, 50 + i * 22, -0.5, 0.5); ctx.stroke();
    }
  },
  roots(ctx, w, h, r, accent) {
    for (let i = 0; i < 9; i++) {
      const bw = 14 + r() * 26, bh = 40 + r() * h * 0.3, x = w * 0.18 + i * w * 0.075;
      roundRect(ctx, x, h * 0.48 - bh, bw, bh, 3, rgba(i % 3 ? INK.dusk : accent, 0.65));
      for (let k = 0; k < bh / 14; k++) ctx.fillStyle = rgba(INK.cream, 0.5), ctx.fillRect(x + 4, h * 0.48 - bh + 6 + k * 14, 4, 4);
    }
    ctx.fillStyle = INK.charcoal; ctx.fillRect(w * 0.12, h * 0.48, w * 0.76, 6);
    ctx.strokeStyle = rgba(INK.wine, 0.8); ctx.lineCap = "round";
    const root = (x: number, y: number, ang: number, len: number, d: number) => {
      if (d === 0 || len < 6) return;
      const nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
      ctx.lineWidth = d * 1.6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      root(nx, ny, ang - 0.4 - r() * 0.3, len * 0.72, d - 1);
      root(nx, ny, ang + 0.4 + r() * 0.3, len * 0.72, d - 1);
    };
    root(w / 2, h * 0.49, Math.PI / 2, h * 0.16, 6);
  },
  deploy(ctx, w, h, _r, accent) {
    const sx = w * 0.62, sy = h * 0.3;
    soft(ctx, 40, rgba(accent, 0.8), () => roundRect(ctx, sx, sy, w * 0.22, h * 0.5, 12, rgba(INK.charcoal, 0.85)));
    for (let i = 0; i < 5; i++) {
      roundRect(ctx, sx + 14, sy + 16 + i * h * 0.09, w * 0.22 - 28, h * 0.06, 4, rgba(INK.mist, 0.25));
      circle(ctx, sx + w * 0.22 - 26, sy + 16 + i * h * 0.09 + h * 0.03, 4, i < 3 ? accent : INK.sage);
    }
    roundRect(ctx, w * 0.18, h * 0.25, w * 0.16, h * 0.13, 8, rgba(INK.cream, 0.95));
    roundRect(ctx, w * 0.2, h * 0.28, w * 0.07, 6, 3, accent);
    roundRect(ctx, w * 0.2, h * 0.31, w * 0.11, 6, 3, rgba(INK.dusk, 0.6));
    ctx.strokeStyle = rgba(accent, 0.7); ctx.lineWidth = 3; ctx.setLineDash([2, 10]);
    ctx.beginPath(); ctx.moveTo(w * 0.34, h * 0.32); ctx.quadraticCurveTo(w * 0.5, h * 0.12, sx, sy + 30); ctx.stroke();
    ctx.setLineDash([]);
  },
  wave(ctx, w, h, r, accent) {
    const mid = h * 0.55;
    for (let layer = 0; layer < 4; layer++) {
      ctx.fillStyle = rgba([INK.sage, INK.dusty, accent, INK.wine][layer], 0.35 + layer * 0.12);
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 3) {
        const env = Math.sin((x / w) * Math.PI);
        const a = (0.15 + (layer * 0.08)) * h * env;
        ctx.lineTo(x, mid + layer * 18 - Math.abs(Math.sin(x * (0.05 + layer * 0.01) + r()) * a));
      }
      ctx.lineTo(w, h); ctx.fill();
    }
    circle(ctx, w * 0.78, h * 0.2, h * 0.07, rgba(INK.cream, 0.9));
  },
  workshop(ctx, w, h, r, accent) {
    ctx.fillStyle = rgba(INK.charcoal, 0.12); ctx.fillRect(w * 0.1, h * 0.12, w * 0.8, h * 0.62);
    for (let i = 0; i < 12; i++) {
      const gx = w * 0.15 + (i % 4) * w * 0.19, gy = h * 0.18 + Math.floor(i / 4) * h * 0.19;
      const col = [accent, INK.sage, INK.ochre, INK.dusk, INK.wine][i % 5];
      if (i % 3 === 0) circle(ctx, gx + 30, gy + 30, 22 + r() * 6, rgba(col, 0.75));
      else if (i % 3 === 1) roundRect(ctx, gx + 6, gy + 8, 50, 44, 6, rgba(col, 0.7));
      else { ctx.fillStyle = rgba(col, 0.75); ctx.beginPath(); ctx.moveTo(gx + 30, gy + 4); ctx.lineTo(gx + 58, gy + 56); ctx.lineTo(gx + 2, gy + 56); ctx.fill(); }
      ctx.fillStyle = INK.charcoal; ctx.fillRect(gx + 28, gy - 4, 4, 8);
    }
    ctx.fillStyle = INK.charcoal; ctx.fillRect(w * 0.08, h * 0.78, w * 0.84, 10);
  },
  send(ctx, w, h, _r, accent) {
    roundRect(ctx, w * 0.12, h * 0.4, w * 0.24, h * 0.3, 8, INK.charcoal);
    roundRect(ctx, w * 0.14, h * 0.43, w * 0.2, h * 0.23, 4, rgba(INK.mist, 0.5));
    ctx.fillStyle = INK.charcoal; ctx.fillRect(w * 0.08, h * 0.7, w * 0.32, 8);
    roundRect(ctx, w * 0.72, h * 0.36, w * 0.1, h * 0.36, 12, INK.charcoal);
    roundRect(ctx, w * 0.735, h * 0.4, w * 0.07, h * 0.27, 6, rgba(INK.mist, 0.5));
    ctx.strokeStyle = rgba(accent, 0.5); ctx.lineWidth = 2; ctx.setLineDash([3, 9]);
    ctx.beginPath(); ctx.moveTo(w * 0.36, h * 0.5); ctx.quadraticCurveTo(w * 0.54, h * 0.18, w * 0.72, h * 0.5); ctx.stroke();
    ctx.setLineDash([]);
    soft(ctx, 30, accent, () => circle(ctx, w * 0.54, h * 0.3, 14, rgba(INK.cream, 1)));
    soft(ctx, 18, accent, () => circle(ctx, w * 0.54, h * 0.3, 7, accent));
  },
  constellation(ctx, w, h, r, accent) {
    ctx.fillStyle = rgba(INK.dusk, 0.25); ctx.fillRect(0, 0, w, h * 0.7);
    const pts: [number, number][] = [];
    for (let i = 0; i < 11; i++) pts.push([w * (0.1 + r() * 0.8), h * (0.1 + r() * 0.55)]);
    ctx.strokeStyle = rgba(INK.cream, 0.5); ctx.lineWidth = 1.5;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    pts.forEach(([x, y], i) => {
      const pw = 34 + r() * 20, ph = pw * 0.75;
      ctx.save(); ctx.translate(x, y); ctx.rotate((r() - 0.5) * 0.4);
      roundRect(ctx, -pw / 2 - 3, -ph / 2 - 3, pw + 6, ph + 6, 2, INK.cream);
      const g = ctx.createLinearGradient(0, -ph / 2, 0, ph / 2);
      g.addColorStop(0, i % 2 ? accent : INK.sage); g.addColorStop(1, i % 3 ? INK.ochre : INK.dusk);
      ctx.fillStyle = g; ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      ctx.restore();
    });
    hills(ctx, w, h, h * 0.8, 12, rgba(INK.moss, 0.7), r);
  },
  sculpture(ctx, w, h, r, accent) {
    roundRect(ctx, w * 0.4, h * 0.68, w * 0.2, h * 0.22, 4, rgba(INK.mist, 0.9));
    const cx = w / 2, cy = h * 0.43;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      ctx.strokeStyle = rgba(i % 2 ? accent : INK.wine, 0.55);
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * 18, cy + Math.sin(a * 2) * 10, h * 0.2, h * 0.08, a, 0, Math.PI * 2);
      ctx.stroke();
    }
    soft(ctx, 40, rgba(INK.cream, 1), () => circle(ctx, cx - 40, cy - 50, 10, rgba(INK.cream, 0.7)));
    void r;
  },
  recursive(ctx, w, h, _r, accent) {
    let x = w * 0.1, y = h * 0.1, fw = w * 0.8, fh = h * 0.75;
    for (let i = 0; i < 7; i++) {
      roundRect(ctx, x, y, fw, fh, 6, i % 2 ? rgba(INK.cream, 0.92) : rgba(i === 0 ? INK.charcoal : accent, 0.75));
      x += fw * 0.12; y += fh * 0.1; fw *= 0.76; fh *= 0.76;
    }
    circle(ctx, w * 0.84, h * 0.14, 8, "#c0392b");
  },
  threads(ctx, w, h, r, accent) {
    const nodes: [number, number][] = [[w * 0.2, h * 0.3], [w * 0.8, h * 0.28], [w * 0.5, h * 0.72], [w * 0.22, h * 0.7], [w * 0.78, h * 0.68]];
    ctx.lineWidth = 2;
    nodes.forEach((a, i) => nodes.forEach((b, j) => {
      if (j <= i) return;
      ctx.strokeStyle = rgba(j % 2 ? accent : INK.sage, 0.55);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]);
      ctx.bezierCurveTo((a[0] + b[0]) / 2, a[1] - 40 * r(), (a[0] + b[0]) / 2, b[1] + 40 * r(), b[0], b[1]); ctx.stroke();
    }));
    nodes.forEach(([x, y], i) => {
      roundRect(ctx, x - 26, y - 20, 52, 40, 6, INK.charcoal);
      roundRect(ctx, x - 20, y - 14, 40, 26, 3, rgba(i % 2 ? accent : INK.sage, 0.8));
    });
  },
  reel(ctx, w, h, r, accent) {
    const reel = (x: number, y: number, rad: number) => {
      circle(ctx, x, y, rad, INK.charcoal);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        circle(ctx, x + Math.cos(a) * rad * 0.55, y + Math.sin(a) * rad * 0.55, rad * 0.2, rgba(INK.cream, 0.9));
      }
      circle(ctx, x, y, rad * 0.12, accent);
    };
    reel(w * 0.33, h * 0.38, h * 0.2);
    reel(w * 0.62, h * 0.32, h * 0.15);
    ctx.fillStyle = rgba(INK.charcoal, 0.85);
    ctx.beginPath(); ctx.moveTo(w * 0.33, h * 0.58); ctx.bezierCurveTo(w * 0.5, h * 0.9, w * 0.8, h * 0.6, w * 0.95, h * 0.85);
    ctx.lineTo(w * 0.95, h * 0.92); ctx.bezierCurveTo(w * 0.8, h * 0.67, w * 0.5, h * 0.97, w * 0.33, h * 0.64); ctx.fill();
    for (let i = 0; i < 8; i++) roundRect(ctx, w * (0.42 + i * 0.065), h * (0.74 + Math.sin(i) * 0.03), 18, 12, 2, rgba(i % 2 ? accent : INK.ochre, 0.8));
    void r;
  },
  branches(ctx, w, h, _r, accent) {
    ctx.lineCap = "round"; ctx.lineWidth = 6;
    const main = (y: number) => y;
    ctx.strokeStyle = INK.charcoal;
    ctx.beginPath(); ctx.moveTo(w * 0.08, main(h * 0.55)); ctx.lineTo(w * 0.92, main(h * 0.55)); ctx.stroke();
    const branch = (x0: number, x1: number, dy: number, col: string) => {
      ctx.strokeStyle = col;
      ctx.beginPath(); ctx.moveTo(x0, h * 0.55);
      ctx.bezierCurveTo(x0 + 40, h * 0.55 + dy, x1 - 40, h * 0.55 + dy, x1, h * 0.55); ctx.stroke();
    };
    branch(w * 0.18, w * 0.5, -h * 0.28, accent);
    branch(w * 0.35, w * 0.72, h * 0.25, INK.sage);
    branch(w * 0.55, w * 0.88, -h * 0.2, INK.ochre);
    [0.08, 0.18, 0.35, 0.5, 0.55, 0.72, 0.88, 0.92].forEach((t) => circle(ctx, w * t, h * 0.55, 10, INK.cream));
    [0.08, 0.18, 0.35, 0.5, 0.55, 0.72, 0.88, 0.92].forEach((t) => circle(ctx, w * t, h * 0.55, 5, INK.wine));
  },
  pages(ctx, w, h, r, accent) {
    arch(ctx, w * 0.25, h * 0.85, w * 0.22, h * 0.6, rgba(INK.charcoal, 0.85));
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const x = w * (0.36 + t * 0.55), y = h * (0.6 - Math.sin(t * Math.PI) * 0.35);
      ctx.save(); ctx.translate(x, y); ctx.rotate((r() - 0.5) * 0.8);
      roundRect(ctx, -18, -24, 36, 48, 2, rgba(INK.cream, 0.95));
      roundRect(ctx, -12, -16, 24, 5, 2, rgba(accent, 0.8));
      roundRect(ctx, -12, -6, 18, 4, 2, rgba(INK.dusk, 0.5));
      roundRect(ctx, -12, 2, 22, 4, 2, rgba(INK.dusk, 0.5));
      ctx.restore();
    }
  },
  editor(ctx, w, h, r, accent) {
    roundRect(ctx, w * 0.14, h * 0.14, w * 0.72, h * 0.66, 12, rgba(INK.charcoal, 0.9));
    roundRect(ctx, w * 0.14, h * 0.14, w * 0.12, h * 0.66, 12, rgba(INK.wine, 0.6));
    for (let l = 0; l < 10; l++) {
      let x = w * 0.3 + (l % 3) * 16;
      for (let k = 0; k < 3; k++) {
        const len = 20 + r() * 60;
        roundRect(ctx, x, h * 0.2 + l * h * 0.055, len, 7, 3, rgba([accent, INK.sage, INK.ochre, INK.mist][(l + k) % 4], 0.85));
        x += len + 10;
      }
    }
  },
  containers(ctx, w, h, r, accent) {
    const cols = [accent, INK.sage, INK.ochre, INK.dusk, INK.dusty, INK.teal];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) {
      const bw = w * 0.17, bh = h * 0.13;
      const x = w * 0.16 + i * bw * 1.06 + row * bw * 0.53, y = h * 0.72 - row * bh * 1.08;
      roundRect(ctx, x, y, bw, bh, 3, rgba(cols[(row * 3 + i) % cols.length], 0.85));
      for (let s = 1; s < 6; s++) { ctx.fillStyle = rgba(INK.charcoal, 0.18); ctx.fillRect(x + (bw / 6) * s, y + 4, 2, bh - 8); }
    }
    ctx.strokeStyle = rgba(INK.charcoal, 0.8); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(w * 0.78, h * 0.08); ctx.lineTo(w * 0.78, h * 0.3); ctx.stroke();
    roundRect(ctx, w * 0.7, h * 0.3, w * 0.16, h * 0.1, 3, rgba(INK.wine, 0.85));
    void r;
  },
  cloud(ctx, w, h, r, accent) {
    soft(ctx, 30, rgba(INK.cream, 1), () => {
      [[0.38, 0.38, 0.12], [0.5, 0.3, 0.15], [0.63, 0.38, 0.11], [0.5, 0.42, 0.13]].forEach(([x, y, s]) => circle(ctx, w * x, h * y, h * s, rgba(INK.cream, 0.95)));
    });
    for (let i = 0; i < 6; i++) {
      const x = w * (0.15 + i * 0.14), y = h * (0.72 + (i % 2) * 0.06);
      ctx.strokeStyle = rgba(accent, 0.45); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 14, y); ctx.lineTo(w * 0.5, h * 0.5); ctx.stroke();
      roundRect(ctx, x, y, 28, 34, 3, rgba(i % 2 ? INK.dusk : accent, 0.8));
    }
    void r;
  },
  bridge(ctx, w, h, r, accent) {
    hills(ctx, w, h, h * 0.75, 10, rgba(INK.dusk, 0.55), r);
    ctx.strokeStyle = INK.charcoal; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(w * 0.05, h * 0.55); ctx.lineTo(w * 0.95, h * 0.55); ctx.stroke();
    ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(w / 2, h * 1.05, w * 0.42, Math.PI * 1.18, Math.PI * 1.82); ctx.stroke();
    for (let i = 1; i < 10; i++) {
      const x = w * (0.08 + i * 0.084);
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, h * 0.55); ctx.lineTo(x, h * 0.62 + Math.abs(i - 5) * 6); ctx.stroke();
    }
    soft(ctx, 20, accent, () => roundRect(ctx, w * 0.42, h * 0.45, w * 0.14, h * 0.09, 6, accent));
    roundRect(ctx, w * 0.45, h * 0.47, 14, 10, 2, INK.cream);
  },
  cabinet(ctx, w, h, _r, accent) {
    roundRect(ctx, w * 0.32, h * 0.08, w * 0.36, h * 0.86, 10, rgba(INK.wine, 0.9));
    roundRect(ctx, w * 0.36, h * 0.16, w * 0.28, h * 0.3, 6, INK.charcoal);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) if ((i + j) % 3 === 0) roundRect(ctx, w * 0.39 + i * 12, h * 0.22 + j * 14, 10, 10, 1, accent);
    roundRect(ctx, w * 0.34, h * 0.52, w * 0.32, h * 0.1, 4, rgba(INK.charcoal, 0.6));
    circle(ctx, w * 0.42, h * 0.57, 9, INK.cream);
    circle(ctx, w * 0.55, h * 0.57, 7, INK.ochre);
    circle(ctx, w * 0.6, h * 0.57, 7, INK.sage);
  },
  search(ctx, w, h, r, accent) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const x = w / 2 + Math.cos(a) * w * 0.36, y = h * 0.45 + Math.sin(a) * h * 0.32;
      ctx.strokeStyle = rgba(INK.dusk, 0.4); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(w / 2, h * 0.45); ctx.stroke();
      circle(ctx, x, y, 12 + r() * 6, rgba([accent, INK.sage, INK.ochre][i % 3], 0.8));
    }
    roundRect(ctx, w * 0.34, h * 0.33, w * 0.32, h * 0.24, 10, rgba(INK.cream, 0.96));
    ctx.strokeStyle = INK.charcoal; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(w * 0.48, h * 0.44, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * 0.495, h * 0.47); ctx.lineTo(w * 0.53, h * 0.52); ctx.stroke();
  },
  screen(ctx, w, h, r, accent) {
    ctx.fillStyle = rgba(INK.wine, 0.35); ctx.fillRect(0, h * 0.7, w, h * 0.3);
    soft(ctx, 50, rgba(accent, 0.9), () => roundRect(ctx, w * 0.22, h * 0.16, w * 0.56, h * 0.4, 6, rgba(INK.cream, 0.95)));
    void r;
    roundRect(ctx, w * 0.26, h * 0.4, w * 0.12, h * 0.12, 3, rgba(accent, 0.7));
    roundRect(ctx, w * 0.41, h * 0.4, w * 0.12, h * 0.12, 3, rgba(INK.sage, 0.7));
    roundRect(ctx, w * 0.56, h * 0.4, w * 0.12, h * 0.12, 3, rgba(INK.ochre, 0.7));
    roundRect(ctx, w * 0.2, h * 0.68, w * 0.6, h * 0.12, 30, rgba(INK.charcoal, 0.8));
    figure(ctx, w * 0.4, h * 0.7, 40, INK.charcoal); figure(ctx, w * 0.6, h * 0.7, 36, INK.charcoal);
  },
  film(ctx, w, h, r, accent) {
    for (let i = 0; i < 7; i++) {
      const x = w * 0.1 + i * w * 0.115, tall = h * (0.42 + r() * 0.12);
      roundRect(ctx, x, h * 0.8 - tall, w * 0.09, tall, 3, rgba([accent, INK.wine, INK.dusk, INK.sage, INK.ochre][i % 5], 0.85));
      roundRect(ctx, x + 6, h * 0.8 - tall + 10, w * 0.09 - 12, tall * 0.4, 2, rgba(INK.cream, 0.55));
    }
    ctx.fillStyle = INK.charcoal; ctx.fillRect(w * 0.06, h * 0.8, w * 0.88, 8);
  },
  filter(ctx, w, h, r, accent) {
    for (let i = 0; i < 40; i++) {
      const x = r() * w * 0.45, y = h * 0.15 + r() * h * 0.65;
      ctx.strokeStyle = rgba(i % 3 ? INK.dusty : INK.ochre, 0.5); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 14 + r() * 20, y + (r() - 0.5) * 12); ctx.stroke();
    }
    ctx.fillStyle = rgba(INK.charcoal, 0.85);
    ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.12); ctx.quadraticCurveTo(w * 0.64, h * 0.5, w * 0.5, h * 0.9);
    ctx.quadraticCurveTo(w * 0.56, h * 0.5, w * 0.5, h * 0.12); ctx.fill();
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = rgba(accent, 0.8); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(w * 0.6, h * (0.3 + i * 0.13)); ctx.lineTo(w * 0.9, h * (0.3 + i * 0.13)); ctx.stroke();
    }
  },
  chip(ctx, w, h, _r, accent) {
    const s = h * 0.44, x = w / 2 - s / 2, y = h * 0.24;
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = INK.charcoal;
      ctx.fillRect(x + 10 + i * (s - 20) / 7 - 3, y - 18, 6, 18);
      ctx.fillRect(x + 10 + i * (s - 20) / 7 - 3, y + s, 6, 18);
      ctx.fillRect(x - 18, y + 10 + i * (s - 20) / 7 - 3, 18, 6);
      ctx.fillRect(x + s, y + 10 + i * (s - 20) / 7 - 3, 18, 6);
    }
    roundRect(ctx, x, y, s, s, 8, INK.charcoal);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      roundRect(ctx, x + 14 + i * (s - 28) / 3, y + 14 + j * (s - 28) / 3, (s - 28) / 3 - 8, (s - 28) / 3 - 8, 4,
        rgba((i + j) % 2 ? accent : INK.sage, 0.85));
  },
  window(ctx, w, h, r, accent) {
    arch(ctx, w / 2, h * 0.86, w * 0.5, h * 0.74, rgba(INK.charcoal, 0.85));
    arch(ctx, w / 2, h * 0.84, w * 0.44, h * 0.68, rgba(INK.cream, 0.9));
    hills(ctx, w, h, h * 0.66, 8, rgba(accent, 0.5), r);
    circle(ctx, w * 0.55, h * 0.4, h * 0.07, rgba(INK.ochre, 0.8));
    roundRect(ctx, w * 0.34, h * 0.2, w * 0.32, 10, 5, rgba(INK.dusk, 0.6));
  },
  terminal(ctx, w, h, r, accent) {
    roundRect(ctx, w * 0.18, h * 0.16, w * 0.64, h * 0.56, 10, rgba(INK.charcoal, 0.95));
    [INK.dusty, INK.ochre, INK.sage].forEach((c, i) => circle(ctx, w * 0.22 + i * 16, h * 0.2, 4, c));
    ctx.font = `${Math.round(h * 0.05)}px ui-monospace, monospace`;
    for (let l = 0; l < 6; l++) {
      ctx.fillStyle = rgba(l % 2 ? INK.mist : accent, 0.85);
      ctx.fillText("❯ " + "▁".repeat(3 + Math.floor(r() * 9)), w * 0.22, h * 0.3 + l * h * 0.065);
    }
    roundRect(ctx, w * 0.14, h * 0.74, w * 0.72, h * 0.06, 4, rgba(INK.wine, 0.7));
  },
  foundation(ctx, w, h, _r, accent) {
    for (let i = 0; i < 5; i++) {
      const bw = w * 0.14;
      arch(ctx, w * 0.16 + i * w * 0.17, h * 0.5, bw, h * (0.22 + (i % 2) * 0.06), rgba([accent, INK.sage, INK.dusk, INK.ochre, INK.dusty][i], 0.8));
    }
    for (let k = 0; k < 4; k++) roundRect(ctx, w * 0.08, h * (0.52 + k * 0.1), w * 0.84, h * 0.08, 2, rgba(INK.charcoal, 0.85 - k * 0.15));
  },
  transform(ctx, w, h, r, accent) {
    roundRect(ctx, w * 0.08, h * 0.38, w * 0.2, h * 0.22, 4, rgba(INK.charcoal, 0.85));
    for (let i = 0; i < 30; i++) circle(ctx, w * 0.1 + r() * w * 0.16, h * 0.4 + r() * h * 0.18, 2, rgba(INK.mist, 0.6));
    ctx.fillStyle = rgba(INK.charcoal, 0.85);
    ctx.beginPath(); ctx.moveTo(w * 0.3, h * 0.42); ctx.lineTo(w * 0.42, h * 0.49); ctx.lineTo(w * 0.3, h * 0.56); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const y = h * (0.15 + i * 0.2);
      ctx.strokeStyle = rgba(accent, 0.5); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(w * 0.44, h * 0.49); ctx.quadraticCurveTo(w * 0.55, y, w * 0.64, y + 20); ctx.stroke();
      roundRect(ctx, w * 0.64, y, w * (0.14 + i * 0.03), h * 0.13, 4, rgba([accent, INK.sage, INK.ochre, INK.dusk][i], 0.85));
    }
  },
  flame(ctx, w, h, r, accent) {
    circle(ctx, w / 2, h * 0.47, h * 0.3, rgba(INK.dusk, 0.6));
    ctx.strokeStyle = rgba(INK.cream, 0.4); ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.ellipse(w / 2, h * 0.47, Math.abs(i) * h * 0.1, h * 0.3, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = rgba(accent, 0.9);
    ctx.beginPath(); ctx.moveTo(w * 0.62, h * 0.2);
    ctx.bezierCurveTo(w * 0.82, h * 0.4, w * 0.72, h * 0.82, w * 0.48, h * 0.78);
    ctx.bezierCurveTo(w * 0.3, h * 0.74, w * 0.3, h * 0.5, w * 0.42, h * 0.42);
    ctx.bezierCurveTo(w * 0.44, h * 0.56, w * 0.56, h * 0.58, w * 0.58, h * 0.46);
    ctx.bezierCurveTo(w * 0.6, h * 0.36, w * 0.56, h * 0.28, w * 0.62, h * 0.2); ctx.fill();
    void r;
  },
  diorama(ctx, w, h, r, accent) {
    ctx.fillStyle = rgba(INK.sage, 0.8);
    ctx.beginPath(); ctx.moveTo(w * 0.15, h * 0.6); ctx.lineTo(w * 0.5, h * 0.45); ctx.lineTo(w * 0.85, h * 0.6); ctx.lineTo(w * 0.5, h * 0.75); ctx.fill();
    ctx.fillStyle = rgba(INK.moss, 0.9);
    ctx.beginPath(); ctx.moveTo(w * 0.15, h * 0.6); ctx.lineTo(w * 0.5, h * 0.75); ctx.lineTo(w * 0.5, h * 0.85); ctx.lineTo(w * 0.15, h * 0.7); ctx.fill();
    ctx.fillStyle = rgba(INK.wine, 0.8);
    ctx.beginPath(); ctx.moveTo(w * 0.85, h * 0.6); ctx.lineTo(w * 0.5, h * 0.75); ctx.lineTo(w * 0.5, h * 0.85); ctx.lineTo(w * 0.85, h * 0.7); ctx.fill();
    cypress(ctx, w * 0.36, h * 0.6, h * 0.2, INK.moss);
    cypress(ctx, w * 0.62, h * 0.58, h * 0.16, INK.moss);
    figure(ctx, w * 0.5, h * 0.62, 26, accent);
    for (let i = 0; i < 4; i++) circle(ctx, w * (0.3 + r() * 0.4), h * (0.2 + r() * 0.15), 6, rgba(INK.ochre, 0.9));
  },
  tables(ctx, w, h, r, accent) {
    const boxes: [number, number][] = [[0.15, 0.2], [0.55, 0.15], [0.35, 0.55], [0.72, 0.55]];
    ctx.strokeStyle = rgba(INK.charcoal, 0.6); ctx.lineWidth = 2;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      if ((i + j) % 2 === 0 && r() > 0.3) continue;
      ctx.beginPath(); ctx.moveTo(w * boxes[i][0] + 50, h * boxes[i][1] + 30); ctx.lineTo(w * boxes[j][0] + 50, h * boxes[j][1] + 30); ctx.stroke();
    }
    boxes.forEach(([x, y], i) => {
      roundRect(ctx, w * x, h * y, 100, 76, 6, rgba(INK.cream, 0.96));
      roundRect(ctx, w * x, h * y, 100, 16, 6, rgba(i % 2 ? accent : INK.dusk, 0.9));
      for (let k = 0; k < 4; k++) roundRect(ctx, w * x + 8, h * y + 24 + k * 12, 50 + r() * 30, 5, 2, rgba(INK.charcoal, 0.35));
    });
  },
  circuit(ctx, w, h, r, accent) {
    roundRect(ctx, w * 0.12, h * 0.14, w * 0.76, h * 0.68, 14, rgba(INK.teal, 0.85));
    ctx.strokeStyle = rgba(INK.cream, 0.6); ctx.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath(); const y = h * (0.22 + i * 0.065);
      ctx.moveTo(w * 0.16, y); ctx.lineTo(w * (0.3 + r() * 0.2), y); ctx.lineTo(w * (0.45 + r() * 0.1), y + 20); ctx.lineTo(w * 0.84, y + 20); ctx.stroke();
    }
    roundRect(ctx, w * 0.42, h * 0.36, w * 0.18, h * 0.22, 3, INK.charcoal);
    for (let i = 0; i < 6; i++) soft(ctx, 16, accent, () => circle(ctx, w * (0.2 + i * 0.11), h * 0.76, 6, i % 2 ? accent : INK.ochre));
  },
  vault(ctx, w, h, _r, accent) {
    arch(ctx, w / 2, h * 0.92, w * 0.7, h * 0.82, rgba(INK.wine, 0.85));
    arch(ctx, w / 2, h * 0.9, w * 0.62, h * 0.74, rgba(INK.charcoal, 0.85));
    for (let row = 0; row < 4; row++) for (let i = 0; i < 4; i++) {
      roundRect(ctx, w * 0.27 + i * w * 0.12, h * 0.4 + row * h * 0.11, w * 0.1, h * 0.08, 3, rgba(INK.mist, 0.25));
      circle(ctx, w * 0.27 + i * w * 0.12 + w * 0.085, h * 0.44 + row * h * 0.11, 3, (row + i) % 3 ? INK.sage : accent);
    }
    ctx.strokeStyle = rgba(accent, 0.8); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(w / 2, h * 0.28, h * 0.07, -Math.PI * 0.9, Math.PI * 0.6); ctx.stroke();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(w / 2 - h * 0.075, h * 0.24); ctx.lineTo(w / 2 - h * 0.1, h * 0.3); ctx.lineTo(w / 2 - h * 0.045, h * 0.29); ctx.fill();
  },
  // --- Catalogue additions (from Notion artwork concepts) ---------------------
  fedora(ctx, w, h, r) {
    // Sunlit desk, open laptop, folded-paper panels and glass windows in sapphire.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(60,90,160,0.35)"); g.addColorStop(1, "rgba(200,215,240,0.2)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = rgba(i % 2 ? "#dfe8f7" : "#9db4e0", 0.75);
      ctx.beginPath(); const x = w * (0.08 + i * 0.22);
      ctx.moveTo(x, h * 0.18); ctx.lineTo(x + w * 0.18, h * 0.12 + i * 6); ctx.lineTo(x + w * 0.2, h * 0.5); ctx.lineTo(x + 6, h * 0.55); ctx.fill();
      ctx.strokeStyle = "rgba(40,60,120,0.35)"; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.fillStyle = "#6b4e3a"; ctx.fillRect(0, h * 0.72, w, h * 0.28);
    roundRect(ctx, w * 0.33, h * 0.44, w * 0.34, h * 0.24, 6, "#2f3d63");
    roundRect(ctx, w * 0.35, h * 0.46, w * 0.3, h * 0.2, 3, "#bcd0f2");
    ctx.fillStyle = "#26304f"; ctx.beginPath(); ctx.moveTo(w * 0.28, h * 0.74); ctx.lineTo(w * 0.72, h * 0.74); ctx.lineTo(w * 0.67, h * 0.68); ctx.lineTo(w * 0.33, h * 0.68); ctx.fill();
    soft(ctx, 40, "#fff8e0", () => circle(ctx, w * 0.82, h * 0.2, h * 0.06, "rgba(255,248,224,0.9)"));
    void r;
  },
  arch(ctx, w, h, r) {
    // Interlocking stone blocks and fine tools under a quiet blue night.
    ctx.fillStyle = "rgba(30,45,90,0.55)"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) circle(ctx, r() * w, r() * h * 0.5, 1 + r() * 1.5, "rgba(240,240,255,0.8)");
    const bw = w * 0.11, bh = h * 0.09;
    for (let row = 0; row < 4; row++) for (let i = 0; i < 6 - row; i++) {
      const x = w * 0.2 + i * bw * 1.02 + row * bw * 0.51, y = h * 0.82 - (row + 1) * bh * 1.05;
      roundRect(ctx, x, y, bw, bh, 3, rgba(row % 2 ? "#c9c2b4" : "#a9a395", 0.95));
      ctx.strokeStyle = "rgba(40,40,60,0.35)"; ctx.lineWidth = 1.5; ctx.strokeRect(x + 3, y + 3, bw - 6, bh - 6);
    }
    ctx.strokeStyle = "#d6dbe8"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(w * 0.78, h * 0.3); ctx.lineTo(w * 0.86, h * 0.52); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * 0.74, h * 0.36); ctx.lineTo(w * 0.9, h * 0.4); ctx.stroke();
    ctx.fillStyle = "#1f2742"; ctx.fillRect(0, h * 0.82, w, h * 0.18);
  },
  mint(ctx, w, h, r) {
    // Cozy desktop studio with leafy windowpanes in mint green.
    ctx.fillStyle = "rgba(160,210,170,0.35)"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3; i++) {
      const x = w * (0.1 + i * 0.28);
      roundRect(ctx, x, h * 0.1, w * 0.22, h * 0.36, 6, "rgba(235,248,236,0.9)");
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = rgba(k % 2 ? "#6fae7d" : "#8fc79a", 0.85);
        ctx.beginPath(); const lx = x + 12 + r() * w * 0.18, ly = h * 0.14 + r() * h * 0.28;
        ctx.ellipse(lx, ly, 10, 5, r() * 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.fillStyle = "#8a6a4c"; ctx.fillRect(0, h * 0.7, w, h * 0.3);
    roundRect(ctx, w * 0.36, h * 0.46, w * 0.28, h * 0.2, 6, "#3d4b42");
    roundRect(ctx, w * 0.38, h * 0.48, w * 0.24, h * 0.15, 3, "#d8f0dc");
    roundRect(ctx, w * 0.48, h * 0.66, w * 0.04, h * 0.05, 1, "#3d4b42");
    roundRect(ctx, w * 0.12, h * 0.6, w * 0.16, h * 0.1, 3, "#e9d9a6");
    roundRect(ctx, w * 0.72, h * 0.58, w * 0.12, h * 0.12, 3, "#c98f6b");
  },
  debian(ctx, w, h, r) {
    // A sturdy handcrafted library supporting a stable illuminated workstation.
    ctx.fillStyle = "rgba(240,228,206,0.6)"; ctx.fillRect(0, 0, w, h);
    for (let shelf = 0; shelf < 3; shelf++) {
      const y = h * (0.18 + shelf * 0.2);
      ctx.fillStyle = "#6b3a3f"; ctx.fillRect(w * 0.06, y + h * 0.15, w * 0.88, 6);
      let x = w * 0.08;
      while (x < w * 0.9) {
        const bw = 10 + r() * 16, bh = h * (0.1 + r() * 0.05);
        roundRect(ctx, x, y + h * 0.15 - bh, bw, bh, 2, r() > 0.5 ? "#8e3f52" : r() > 0.5 ? "#e8d8bc" : "#b57d6e");
        x += bw + 2;
      }
    }
    ctx.strokeStyle = "rgba(142,63,82,0.6)"; ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(w * (0.15 + i * 0.14), h * 0.73); ctx.quadraticCurveTo(w * 0.5, h * 0.62, w * 0.5, h * 0.8); ctx.stroke(); }
    roundRect(ctx, w * 0.38, h * 0.76, w * 0.24, h * 0.14, 4, "#5e2836");
    soft(ctx, 30, "#ffeec8", () => roundRect(ctx, w * 0.41, h * 0.78, w * 0.18, h * 0.09, 2, "#fff1d4"));
  },
  ubuntu(ctx, w, h, r) {
    // A circular communal worktable sharing light from one glowing lamp.
    ctx.fillStyle = "rgba(233,150,110,0.3)"; ctx.fillRect(0, 0, w, h);
    soft(ctx, 60, "#ffd9a8", () => circle(ctx, w / 2, h * 0.3, h * 0.07, "#fff0d6"));
    ctx.strokeStyle = "#5e2836"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h * 0.24); ctx.stroke();
    ctx.fillStyle = "#b8573e"; ctx.beginPath(); ctx.ellipse(w / 2, h * 0.68, w * 0.36, h * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#d9825f"; ctx.beginPath(); ctx.ellipse(w / 2, h * 0.66, w * 0.34, h * 0.11, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.1 + i * 0.16);
      const x = w / 2 + Math.cos(a) * w * 0.27, y = h * 0.66 + Math.sin(a) * h * 0.07;
      roundRect(ctx, x - 14, y - 16, 28, 18, 2, "#5e2836");
      roundRect(ctx, x - 11, y - 14, 22, 12, 1, "#ffe2c0");
    }
    void r;
  },
  doorway(ctx, w, h) {
    // An unfinished clinic doorway drawn in silver pencil, with a Coming Soon plaque.
    ctx.strokeStyle = "rgba(120,120,130,0.8)"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(w * 0.32, h * 0.88); ctx.lineTo(w * 0.32, h * 0.38);
    ctx.arc(w / 2, h * 0.38, w * 0.18, Math.PI, 0); ctx.lineTo(w * 0.68, h * 0.88); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(120,120,130,0.35)";
    for (let i = 0; i < 18; i++) { ctx.beginPath(); ctx.moveTo(w * 0.34 + i * 7, h * 0.86); ctx.lineTo(w * 0.34 + i * 7 + 20, h * 0.6); ctx.stroke(); }
    roundRect(ctx, w * 0.4, h * 0.2, w * 0.2, h * 0.08, 3, "#c9c9cf");
    ctx.fillStyle = "#4b4b55"; ctx.textAlign = "center"; ctx.font = `600 ${Math.round(h * 0.035)}px Georgia, serif`;
    ctx.fillText("COMING SOON", w / 2, h * 0.255);
  },
  suitcase(ctx, w, h, r) {
    // A tiny suitcase carrying a whole library of folded paper objects.
    roundRect(ctx, w * 0.3, h * 0.42, w * 0.4, h * 0.36, 10, "#8e5a3c");
    roundRect(ctx, w * 0.32, h * 0.44, w * 0.36, h * 0.12, 6, "#a46d4c");
    roundRect(ctx, w * 0.45, h * 0.36, w * 0.1, h * 0.07, 8, "#5e3a28");
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = rgba(i % 3 ? INK.cream : INK.rose, 0.95);
      ctx.save(); ctx.translate(w * (0.34 + r() * 0.3), h * (0.18 + r() * 0.22)); ctx.rotate((r() - 0.5) * 1.2);
      ctx.beginPath(); ctx.moveTo(-16, 10); ctx.lineTo(0, -14); ctx.lineTo(16, 10); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  },
  paperPlane(ctx, w, h) {
    // A paper plane carrying a small photo between two quiet windows.
    arch(ctx, w * 0.15, h * 0.85, w * 0.18, h * 0.5, "rgba(61,55,55,0.75)");
    arch(ctx, w * 0.85, h * 0.85, w * 0.18, h * 0.5, "rgba(61,55,55,0.75)");
    ctx.strokeStyle = "rgba(61,55,55,0.35)"; ctx.setLineDash([4, 8]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w * 0.22, h * 0.5); ctx.quadraticCurveTo(w * 0.5, h * 0.15, w * 0.78, h * 0.45); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#fbf6ee"; ctx.beginPath(); ctx.moveTo(w * 0.42, h * 0.36); ctx.lineTo(w * 0.62, h * 0.28); ctx.lineTo(w * 0.5, h * 0.44); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(61,55,55,0.5)"; ctx.lineWidth = 1.5; ctx.stroke();
    roundRect(ctx, w * 0.5, h * 0.33, 18, 14, 1, "#c48a87");
  },
  blocks(ctx, w, h, r) {
    // Interlocking illustrated programming blocks assembling a small living scene.
    const cols = ["#e0a43c", "#5b8fd8", "#8d6bd1", "#5cb86d", "#d8604e"];
    for (let i = 0; i < 7; i++) {
      const x = w * 0.14 + (i % 2) * 18, y = h * 0.16 + i * h * 0.095;
      roundRect(ctx, x, y, w * (0.22 + r() * 0.12), h * 0.08, 8, cols[i % cols.length]);
      roundRect(ctx, x + 14, y + h * 0.075, 20, 8, 3, cols[i % cols.length]);
    }
    hills(ctx, w, h, h * 0.78, 10, "rgba(110,160,90,0.8)", r);
    circle(ctx, w * 0.72, h * 0.28, h * 0.08, "#f2c14e");
    figure(ctx, w * 0.7, h * 0.78, h * 0.14, "#d8604e");
  },
  towers(ctx, w, h, r) {
    // Illuminated towers, each translucent cube holding a different small computer.
    for (let i = 0; i < 4; i++) {
      const x = w * (0.14 + i * 0.2), th = h * (0.4 + r() * 0.2);
      roundRect(ctx, x, h * 0.85 - th, w * 0.14, th, 4, "rgba(61,55,55,0.85)");
      for (let k = 0; k < Math.floor(th / (h * 0.11)); k++) {
        soft(ctx, 14, "#ffe9b8", () => roundRect(ctx, x + 8, h * 0.85 - th + 10 + k * h * 0.11, w * 0.14 - 16, h * 0.08, 3, `rgba(255,${200 + ((i * 20 + k * 13) % 50)},${150 + ((k * 37) % 90)},0.55)`));
      }
    }
  },
  launcher(ctx, w, h, r, accent) {
    // An illuminated search field revealing drawers of desktop objects.
    soft(ctx, 30, accent, () => roundRect(ctx, w * 0.2, h * 0.2, w * 0.6, h * 0.1, 20, "#fbf6ee"));
    circle(ctx, w * 0.25, h * 0.25, 8, accent);
    for (let i = 0; i < 4; i++) {
      roundRect(ctx, w * 0.24, h * (0.36 + i * 0.12), w * 0.52, h * 0.09, 6, rgba(i === 0 ? accent : "#fbf6ee", i === 0 ? 0.6 : 0.85));
      roundRect(ctx, w * 0.27, h * (0.38 + i * 0.12), h * 0.05, h * 0.05, 4, rgba([INK.sage, INK.ochre, INK.dusk, INK.rose][i], 0.9));
      roundRect(ctx, w * 0.36, h * (0.395 + i * 0.12), w * (0.15 + r() * 0.2), 6, 3, "rgba(61,55,55,0.4)");
    }
  },
};


// --- long-tail landscape compositions ----------------------------------------

function landscape(ctx: Ctx, w: number, h: number, r: () => number, room: Room) {
  const accent = room.palette.accent;
  const variant = Math.floor(r() * 4);
  if (r() > 0.4) soft(ctx, 40, rgba(INK.cream, 1), () => circle(ctx, w * (0.2 + r() * 0.6), h * (0.18 + r() * 0.15), h * (0.05 + r() * 0.06), rgba(r() > 0.5 ? INK.cream : INK.ochre, 0.85)));
  hills(ctx, w, h, h * 0.58, h * 0.05, rgba(mix(accent, INK.mist, 0.55), 0.7), r);
  if (variant === 0) {
    for (let i = 0; i < 3; i++) arch(ctx, w * (0.25 + i * 0.25), h * 0.78, w * 0.1, h * (0.3 + r() * 0.15), rgba(mix(INK.wine, accent, 0.4), 0.55 + i * 0.1));
  } else if (variant === 1) {
    for (let i = 0; i < 5; i++) cypress(ctx, w * (0.12 + r() * 0.76), h * 0.74, h * (0.18 + r() * 0.22), rgba(INK.moss, 0.6 + r() * 0.3));
  } else if (variant === 2) {
    ctx.strokeStyle = rgba(accent, 0.65); ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.7);
    for (let i = 1; i <= 5; i++) ctx.quadraticCurveTo(w * (0.1 + i * 0.16 - 0.08), h * (0.3 + r() * 0.3), w * (0.1 + i * 0.16), h * (0.5 + r() * 0.2));
    ctx.stroke();
  } else {
    for (let i = 0; i < 4; i++) roundRect(ctx, w * (0.15 + i * 0.19), h * (0.42 - r() * 0.15), w * 0.12, h * 0.4, 30, rgba([accent, INK.dusty, INK.sage, INK.dusk][i], 0.45));
  }
  hills(ctx, w, h, h * 0.76, h * 0.03, rgba(mix(INK.wine, accent, 0.3), 0.75), r);
  if (r() > 0.35) figure(ctx, w * (0.3 + r() * 0.4), h * 0.8, h * 0.08, INK.charcoal);
}


// --- Still lifes for the long tail ---------------------------------------------
// Notion's concept for most standard artworks: "a quiet tactile tableau of
// symbolic objects, layered textures and soft light". Each painting gets a
// window or arch onto a landscape, a table, and objects chosen by category.

type Obj = (ctx: Ctx, x: number, base: number, s: number, r: () => number, accent: string) => void;

const OBJECTS: Record<string, Obj> = {
  books(ctx, x, base, s, r, accent) {
    for (let i = 0; i < 4; i++) roundRect(ctx, x - s * 0.5 + i * 2, base - (i + 1) * s * 0.16, s * (0.9 - i * 0.08), s * 0.15, 2, [accent, INK.wine, INK.cream, INK.sage][i]);
    void r;
  },
  lamp(ctx, x, base, s, _r, accent) {
    roundRect(ctx, x - s * 0.18, base - s * 0.06, s * 0.36, s * 0.06, 2, INK.charcoal);
    ctx.fillStyle = INK.charcoal; ctx.fillRect(x - 2, base - s * 0.7, 4, s * 0.66);
    soft(ctx, 40, "#fff2cc", () => {
      ctx.fillStyle = rgba(accent, 0.9); ctx.beginPath();
      ctx.moveTo(x - s * 0.28, base - s * 0.62); ctx.lineTo(x + s * 0.28, base - s * 0.62); ctx.lineTo(x + s * 0.14, base - s * 0.9); ctx.lineTo(x - s * 0.14, base - s * 0.9); ctx.fill();
    });
  },
  key(ctx, x, base, s) {
    ctx.strokeStyle = "#b08a4e"; ctx.lineWidth = s * 0.06;
    ctx.beginPath(); ctx.arc(x - s * 0.25, base - s * 0.12, s * 0.1, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - s * 0.15, base - s * 0.12); ctx.lineTo(x + s * 0.3, base - s * 0.12); ctx.lineTo(x + s * 0.3, base - s * 0.04); ctx.stroke();
  },
  lantern(ctx, x, base, s, _r, accent) {
    roundRect(ctx, x - s * 0.18, base - s * 0.55, s * 0.36, s * 0.5, 6, INK.charcoal);
    soft(ctx, 30, "#ffe9b8", () => roundRect(ctx, x - s * 0.12, base - s * 0.48, s * 0.24, s * 0.36, 4, rgba(accent, 0.6)));
    circle(ctx, x, base - s * 0.3, s * 0.06, "#fff3d6");
    ctx.strokeStyle = INK.charcoal; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, base - s * 0.58, s * 0.1, Math.PI, 0); ctx.stroke();
  },
  teacup(ctx, x, base, s, _r, accent) {
    ctx.fillStyle = INK.cream; ctx.beginPath(); ctx.ellipse(x, base - s * 0.03, s * 0.26, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(x - s * 0.17, base - s * 0.3); ctx.quadraticCurveTo(x - s * 0.16, base - s * 0.05, x, base - s * 0.05); ctx.quadraticCurveTo(x + s * 0.16, base - s * 0.05, x + s * 0.17, base - s * 0.3); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + s * 0.2, base - s * 0.2, s * 0.06, -1.3, 1.3); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 4, base - s * 0.35); ctx.quadraticCurveTo(x + 8, base - s * 0.45, x - 2, base - s * 0.56); ctx.stroke();
  },
  envelope(ctx, x, base, s) {
    ctx.save(); ctx.translate(x, base - s * 0.08); ctx.rotate(-0.12);
    roundRect(ctx, -s * 0.3, -s * 0.18, s * 0.6, s * 0.36, 3, "#f6efe4");
    ctx.strokeStyle = "rgba(61,55,55,0.4)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.18); ctx.lineTo(0, s * 0.04); ctx.lineTo(s * 0.3, -s * 0.18); ctx.stroke();
    circle(ctx, 0, s * 0.04, s * 0.04, INK.wine);
    ctx.restore();
  },
  plant(ctx, x, base, s, r) {
    roundRect(ctx, x - s * 0.14, base - s * 0.24, s * 0.28, s * 0.24, 4, "#b8735a");
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = rgba(i % 2 ? INK.sage : INK.moss, 0.95);
      ctx.save(); ctx.translate(x, base - s * 0.24); ctx.rotate(-1.1 + i * 0.36 + (r() - 0.5) * 0.2);
      ctx.beginPath(); ctx.ellipse(0, -s * 0.25, s * 0.06, s * 0.25, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  },
  globe(ctx, x, base, s, _r, accent) {
    ctx.fillStyle = INK.charcoal; ctx.fillRect(x - 2, base - s * 0.2, 4, s * 0.2);
    roundRect(ctx, x - s * 0.15, base - s * 0.04, s * 0.3, s * 0.04, 2, INK.charcoal);
    circle(ctx, x, base - s * 0.42, s * 0.24, rgba(INK.teal, 0.9));
    ctx.fillStyle = rgba(accent, 0.8); ctx.beginPath(); ctx.ellipse(x - s * 0.06, base - s * 0.48, s * 0.1, s * 0.06, 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#b08a4e"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, base - s * 0.42, s * 0.3, -2.4, 0.8); ctx.stroke();
  },
  gears(ctx, x, base, s, _r, accent) {
    const gear = (gx: number, gy: number, rad: number, col: string) => {
      ctx.fillStyle = col;
      for (let i = 0; i < 10; i++) { ctx.save(); ctx.translate(gx, gy); ctx.rotate((i / 10) * Math.PI * 2); ctx.fillRect(-rad * 0.12, -rad * 1.18, rad * 0.24, rad * 0.3); ctx.restore(); }
      circle(ctx, gx, gy, rad, col); circle(ctx, gx, gy, rad * 0.35, INK.cream);
    };
    gear(x - s * 0.12, base - s * 0.3, s * 0.2, "#b08a4e");
    gear(x + s * 0.2, base - s * 0.16, s * 0.13, accent);
  },
  orb(ctx, x, base, s, _r, accent) {
    roundRect(ctx, x - s * 0.18, base - s * 0.1, s * 0.36, s * 0.1, 4, INK.charcoal);
    soft(ctx, 40, accent, () => circle(ctx, x, base - s * 0.36, s * 0.24, rgba(accent, 0.85)));
    circle(ctx, x - s * 0.08, base - s * 0.44, s * 0.07, "rgba(255,255,255,0.75)");
  },
  scroll(ctx, x, base, s) {
    roundRect(ctx, x - s * 0.34, base - s * 0.16, s * 0.68, s * 0.14, 6, "#efe3cf");
    circle(ctx, x - s * 0.34, base - s * 0.09, s * 0.08, "#d9c7a8");
    circle(ctx, x + s * 0.34, base - s * 0.09, s * 0.08, "#d9c7a8");
    for (let i = 0; i < 3; i++) roundRect(ctx, x - s * 0.24, base - s * 0.13 + i * 8, s * (0.3 + i * 0.05), 3, 1, "rgba(61,55,55,0.35)");
  },
  reel(ctx, x, base, s) {
    circle(ctx, x, base - s * 0.28, s * 0.26, INK.charcoal);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; circle(ctx, x + Math.cos(a) * s * 0.14, base - s * 0.28 + Math.sin(a) * s * 0.14, s * 0.05, INK.cream); }
  },
  record(ctx, x, base, s, _r, accent) {
    ctx.fillStyle = INK.charcoal; ctx.beginPath(); ctx.ellipse(x, base - s * 0.05, s * 0.36, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.ellipse(x, base - s * 0.05, s * 0.1, s * 0.03, 0, 0, Math.PI * 2); ctx.fill();
  },
  palette(ctx, x, base, s) {
    ctx.fillStyle = "#d6b48a"; ctx.beginPath(); ctx.ellipse(x, base - s * 0.06, s * 0.36, s * 0.1, -0.1, 0, Math.PI * 2); ctx.fill();
    [INK.wine, INK.ochre, INK.sage, INK.dusk, INK.rose].forEach((c, i) => circle(ctx, x - s * 0.24 + i * s * 0.11, base - s * 0.07, s * 0.035, c));
  },
  brushes(ctx, x, base, s, r) {
    roundRect(ctx, x - s * 0.12, base - s * 0.3, s * 0.24, s * 0.3, 4, INK.dusty);
    for (let i = 0; i < 4; i++) {
      ctx.save(); ctx.translate(x - s * 0.06 + i * s * 0.04, base - s * 0.28); ctx.rotate(-0.3 + i * 0.2 + (r() - 0.5) * 0.1);
      ctx.fillStyle = "#8a6a3f"; ctx.fillRect(-2, -s * 0.4, 4, s * 0.4);
      ctx.fillStyle = [INK.wine, INK.charcoal, INK.ochre, INK.teal][i]; ctx.fillRect(-3, -s * 0.48, 6, s * 0.1);
      ctx.restore();
    }
  },
  house(ctx, x, base, s, _r, accent) {
    roundRect(ctx, x - s * 0.24, base - s * 0.34, s * 0.48, s * 0.34, 3, "#efe3cf");
    ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(x - s * 0.3, base - s * 0.32); ctx.lineTo(x, base - s * 0.58); ctx.lineTo(x + s * 0.3, base - s * 0.32); ctx.fill();
    soft(ctx, 16, "#ffe4a8", () => roundRect(ctx, x - s * 0.07, base - s * 0.22, s * 0.14, s * 0.12, 2, "#ffe9b8"));
  },
  box(ctx, x, base, s, _r, accent) {
    roundRect(ctx, x - s * 0.26, base - s * 0.3, s * 0.52, s * 0.3, 3, "#b48a62");
    ctx.fillStyle = accent; ctx.fillRect(x - s * 0.04, base - s * 0.3, s * 0.08, s * 0.3);
  },
  feather(ctx, x, base, s) {
    ctx.save(); ctx.translate(x, base - s * 0.05); ctx.rotate(-0.9);
    ctx.fillStyle = "#f6efe4"; ctx.beginPath(); ctx.ellipse(0, -s * 0.28, s * 0.07, s * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = INK.charcoal; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.55); ctx.stroke();
    ctx.restore();
  },
  crystal(ctx, x, base, s, _r, accent) {
    ctx.fillStyle = rgba(accent, 0.75); ctx.beginPath();
    ctx.moveTo(x, base - s * 0.62); ctx.lineTo(x + s * 0.16, base - s * 0.3); ctx.lineTo(x + s * 0.08, base); ctx.lineTo(x - s * 0.08, base); ctx.lineTo(x - s * 0.16, base - s * 0.3); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.beginPath(); ctx.moveTo(x, base - s * 0.62); ctx.lineTo(x + s * 0.06, base - s * 0.3); ctx.lineTo(x - s * 0.04, base - s * 0.1); ctx.fill();
  },
  screen(ctx, x, base, s, _r, accent) {
    roundRect(ctx, x - s * 0.3, base - s * 0.48, s * 0.6, s * 0.4, 5, INK.charcoal);
    roundRect(ctx, x - s * 0.26, base - s * 0.44, s * 0.52, s * 0.3, 2, rgba(accent, 0.6));
    for (let i = 0; i < 3; i++) roundRect(ctx, x - s * 0.22, base - s * 0.4 + i * s * 0.08, s * (0.2 + i * 0.08), 4, 2, "rgba(255,255,255,0.7)");
    ctx.fillStyle = INK.charcoal; ctx.fillRect(x - 3, base - s * 0.08, 6, s * 0.06);
  },
};

const CATEGORY_OBJECTS: Record<string, string[]> = {
  EU: ["lamp", "key", "teacup", "box", "envelope", "plant", "screen"],
  PS: ["key", "lantern", "envelope", "box", "plant"],
  CT: ["brushes", "palette", "plant", "teacup", "lamp", "feather"],
  ME: ["reel", "record", "lamp", "teacup", "screen"],
  PL: ["books", "globe", "feather", "scroll", "teacup", "lamp"],
  AT: ["orb", "scroll", "gears", "screen", "books", "crystal"],
  AM: ["orb", "crystal", "scroll", "books"],
  DI: ["gears", "screen", "box", "books", "lantern"],
  SH: ["house", "box", "lantern", "plant", "key"],
};

function stillLife(ctx: Ctx, w: number, h: number, r: () => number, room: Room, project: Project) {
  const accent = room.palette.accent;
  const deep = mix(INK.wine, accent, 0.35);
  // Back wall with a window or arch opening onto a tiny landscape.
  ctx.fillStyle = rgba(mix(room.palette.wall, INK.cream, 0.3), 0.7);
  ctx.fillRect(0, 0, w, h * 0.66);
  const opening = r() > 0.5;
  const ox = w * (0.18 + r() * 0.5), ow = w * (0.22 + r() * 0.12), oh = h * 0.42, ob = h * 0.6;
  ctx.save();
  ctx.beginPath();
  if (opening) { ctx.moveTo(ox, ob); ctx.lineTo(ox, ob - oh + ow / 2); ctx.arc(ox + ow / 2, ob - oh + ow / 2, ow / 2, Math.PI, 0); ctx.lineTo(ox + ow, ob); }
  else ctx.rect(ox, ob - oh, ow, oh);
  ctx.closePath();
  ctx.clip();
  const sky = ctx.createLinearGradient(0, ob - oh, 0, ob);
  sky.addColorStop(0, mix(accent, INK.cream, 0.55)); sky.addColorStop(1, mix(INK.cream, room.palette.fog, 0.3));
  ctx.fillStyle = sky; ctx.fillRect(ox, ob - oh, ow, oh);
  circle(ctx, ox + ow * (0.3 + r() * 0.4), ob - oh * 0.65, ow * 0.12, rgba(INK.cream, 0.95));
  ctx.translate(ox, 0);
  hills(ctx, ow, ob, ob - oh * 0.25, oh * 0.06, rgba(mix(accent, INK.sage, 0.5), 0.85), r);
  if (r() > 0.4) cypress(ctx, ow * (0.2 + r() * 0.6), ob, oh * 0.4, rgba(INK.moss, 0.9));
  ctx.restore();
  ctx.strokeStyle = rgba(deep, 0.6); ctx.lineWidth = 5;
  if (opening) { ctx.beginPath(); ctx.moveTo(ox, ob); ctx.lineTo(ox, ob - oh + ow / 2); ctx.arc(ox + ow / 2, ob - oh + ow / 2, ow / 2, Math.PI, 0); ctx.lineTo(ox + ow, ob); ctx.stroke(); }
  else { ctx.strokeRect(ox, ob - oh, ow, oh); ctx.beginPath(); ctx.moveTo(ox + ow / 2, ob - oh); ctx.lineTo(ox + ow / 2, ob); ctx.moveTo(ox, ob - oh / 2); ctx.lineTo(ox + ow, ob - oh / 2); ctx.stroke(); }
  // Soft light falling across the scene.
  const beam = ctx.createLinearGradient(ox, 0, ox + w * 0.4, h);
  beam.addColorStop(0, "rgba(255,246,224,0.35)"); beam.addColorStop(1, "rgba(255,246,224,0)");
  ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(ox, ob - oh); ctx.lineTo(ox + ow, ob - oh); ctx.lineTo(ox + ow + w * 0.3, h); ctx.lineTo(ox + w * 0.1, h); ctx.fill();
  // Table.
  const top = h * (0.66 + r() * 0.04);
  ctx.fillStyle = mix("#8a6a4c", accent, 0.2); ctx.fillRect(0, top, w, h - top);
  ctx.fillStyle = "rgba(255,240,215,0.25)"; ctx.fillRect(0, top, w, 5);
  if (r() > 0.5) { ctx.fillStyle = rgba(INK.cream, 0.55); ctx.beginPath(); ctx.moveTo(w * 0.1, top + 3); ctx.lineTo(w * 0.62, top + 3); ctx.lineTo(w * 0.7, h); ctx.lineTo(w * 0.02, h); ctx.fill(); }
  // Objects: a small arrangement chosen from the category's vocabulary.
  const pool = [...(CATEGORY_OBJECTS[project.category] ?? CATEGORY_OBJECTS.EU)];
  const count = 2 + Math.floor(r() * 2);
  const picks: string[] = [];
  for (let i = 0; i < count && pool.length; i++) picks.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  const slots = picks.map((_, i) => (i + 0.5 + (r() - 0.5) * 0.4) / picks.length);
  picks.forEach((name, i) => {
    const s = h * (0.34 + r() * 0.16) * (i === 1 ? 1.15 : 1);
    const x = w * (0.12 + slots[i] * 0.76);
    const base = top + h * 0.06 + r() * h * 0.04;
    // Contact shadow.
    ctx.fillStyle = "rgba(40,25,25,0.18)"; ctx.beginPath(); ctx.ellipse(x + s * 0.05, base, s * 0.32, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    OBJECTS[name](ctx, x, base, s, r, accent);
  });
}

// --- public API ----------------------------------------------------------------

export function paintArtwork(project: Project, room: Room, width = 640): HTMLCanvasElement {
  const h = Math.round(width * 0.75);
  const c = makeCanvas(width, h);
  const ctx = c.getContext("2d")!;
  const r = rng(project.slug);
  const pal = room.palette;
  wash(ctx, width, h, mix(INK.cream, pal.fog, 0.4), mix(pal.wall, pal.accent, 0.18), r);
  strokes(ctx, width, h, pal.accent, 60, r, 0.04);
  strokes(ctx, width, h, INK.cream, 40, r, 0.06);
  if (project.motif) MOTIFS[project.motif](ctx, width, h, r, pal.accent);
  else if (rng(project.slug + ":kind")() < 0.18) landscape(ctx, width, h, r, room);
  else stillLife(ctx, width, h, r, room, project);
  strokes(ctx, width, h, INK.wine, 18, r, 0.03);
  grain(ctx, width, h, r);
  return c;
}

/** Font family behind a next/font CSS variable (falls back to a system font). */
export function cssFont(variable: string, fallback: string) {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.body).getPropertyValue(variable).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

export function paintSign(title: string, subtitle: string, locale: "en" | "ar", palette: Room["palette"], w = 1024, h = 320) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d")!;
  const r = rng(title);
  ctx.fillStyle = mix(palette.wall, INK.cream, 0.5);
  ctx.fillRect(0, 0, w, h);
  strokes(ctx, w, h, palette.accent, 30, r, 0.04);
  ctx.strokeStyle = rgba(palette.trim, 0.7);
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.direction = locale === "ar" ? "rtl" : "ltr";
  ctx.textAlign = "center";
  ctx.fillStyle = palette.trim;
  const display = locale === "ar" ? cssFont("--font-cairo", "sans-serif") : cssFont("--font-display", "Georgia, serif");
  ctx.font = `${locale === "ar" ? 700 : 500} ${Math.round(h * 0.3)}px ${display}`;
  ctx.fillText(title, w / 2, h * 0.5);
  ctx.font = `400 ${Math.round(h * 0.11)}px ${cssFont("--font-cairo", "sans-serif")}`;
  ctx.fillStyle = rgba(INK.charcoal, 0.75);
  ctx.fillText(subtitle, w / 2, h * 0.78, w - 80);
  return c;
}

export function paintPlaque(title: string, palette: Room["palette"], w = 512, h = 96) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = mix(palette.trim, INK.ochre, 0.35);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = mix(INK.cream, palette.fog, 0.3);
  ctx.textAlign = "center";
  ctx.direction = "ltr";
  let size = Math.round(h * 0.46);
  ctx.font = `600 ${size}px ${cssFont("--font-cairo", "sans-serif")}`;
  while (ctx.measureText(title).width > w - 30 && size > 16) {
    size -= 2;
    ctx.font = `600 ${size}px ${cssFont("--font-cairo", "sans-serif")}`;
  }
  ctx.fillText(title, w / 2, h * 0.64);
  return c;
}

export function paintFloor(palette: Room["palette"], seed: string, size = 512) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d")!;
  const r = rng(seed);
  ctx.fillStyle = palette.floor;
  ctx.fillRect(0, 0, size, size);
  strokes(ctx, size, size, INK.cream, 90, r, 0.05);
  strokes(ctx, size, size, palette.trim, 60, r, 0.04);
  ctx.strokeStyle = rgba(palette.trim, 0.12);
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(0, (i * size) / 4); ctx.lineTo(size, (i * size) / 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo((i * size) / 4, 0); ctx.lineTo((i * size) / 4, size); ctx.stroke();
  }
  return c;
}

export function paintWall(palette: Room["palette"], seed: string, size = 512) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d")!;
  const r = rng(seed);
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, mix(palette.wall, INK.cream, 0.45));
  g.addColorStop(1, palette.wall);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  strokes(ctx, size, size, INK.cream, 70, r, 0.06);
  strokes(ctx, size, size, palette.accent, 30, r, 0.025);
  return c;
}

export function dominantColor(room: Room) {
  return mix(room.palette.accent, INK.wine, 0.25);
}
