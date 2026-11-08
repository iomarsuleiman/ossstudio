// Print-ready framed artwork: the painting at high resolution inside its
// designed frame, with a fully transparent canvas outside the frame.
"use client";

import type { Project, Room } from "@/content";
import { paintArtwork } from "./painter";

const ART_W = 1800;

function bevel(ctx: CanvasRenderingContext2D, pts: [number, number][], light: string, dark: string, horizontal: boolean) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const g = horizontal
    ? ctx.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys))
    : ctx.createLinearGradient(Math.min(...xs), 0, Math.max(...xs), 0);
  g.addColorStop(0, light);
  g.addColorStop(0.5, dark);
  g.addColorStop(1, light);
  ctx.fillStyle = g;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

/** Returns a PNG blob: framed painting, transparent outside the frame. */
export async function framedPng(project: Project, room: Room): Promise<Blob> {
  const art = paintArtwork(project, room, ART_W);
  const hero = !!project.openingOrder;
  const border = hero ? 150 : 110;
  const margin = 24; // transparent breathing room beyond the frame edge
  const W = art.width + (border + margin) * 2;
  const H = art.height + (border + margin) * 2;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);

  const o = margin, i = margin + border; // outer and inner edges
  const [light, dark] = hero ? ["#e6c88a", "#8a6234"] : ["#b9957a", "#5e3f34"];
  // Four mitred frame sides, each with a bevel gradient.
  bevel(ctx, [[o, o], [W - o, o], [W - i, i], [i, i]], light, dark, true);
  bevel(ctx, [[o, H - o], [W - o, H - o], [W - i, H - i], [i, H - i]], light, dark, true);
  bevel(ctx, [[o, o], [i, i], [i, H - i], [o, H - o]], light, dark, false);
  bevel(ctx, [[W - o, o], [W - i, i], [W - i, H - i], [W - o, H - o]], light, dark, false);
  // Mitre lines and a fine inner and outer moulding.
  ctx.strokeStyle = "rgba(40,25,15,0.35)";
  ctx.lineWidth = 2;
  for (const [a, b] of [[[o, o], [i, i]], [[W - o, o], [W - i, i]], [[o, H - o], [i, H - i]], [[W - o, H - o], [W - i, H - i]]] as [number, number][][]) {
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  ctx.strokeStyle = hero ? "rgba(255,240,200,0.7)" : "rgba(255,235,215,0.45)";
  ctx.lineWidth = 4;
  ctx.strokeRect(o + border * 0.28, o + border * 0.28, W - 2 * (o + border * 0.28), H - 2 * (o + border * 0.28));
  ctx.strokeStyle = "rgba(40,25,15,0.4)";
  ctx.strokeRect(o + 3, o + 3, W - 2 * o - 6, H - 2 * o - 6);
  if (hero) {
    // Small carved rosettes in the corners of the gilded frame.
    for (const [x, y] of [[o + border / 2, o + border / 2], [W - o - border / 2, o + border / 2], [o + border / 2, H - o - border / 2], [W - o - border / 2, H - o - border / 2]]) {
      for (let k = 0; k < 8; k++) {
        ctx.fillStyle = k % 2 ? "#f1dca8" : "#b98d4f";
        ctx.beginPath();
        ctx.ellipse(x + Math.cos((k / 8) * Math.PI * 2) * 18, y + Math.sin((k / 8) * Math.PI * 2) * 18, 14, 7, (k / 8) * Math.PI * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#7a5228"; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Inner lip casting a soft shadow onto the painting.
  ctx.drawImage(art, i, i);
  const sh = ctx.createLinearGradient(0, i, 0, i + 40);
  sh.addColorStop(0, "rgba(30,15,10,0.35)");
  sh.addColorStop(1, "rgba(30,15,10,0)");
  ctx.fillStyle = sh;
  ctx.fillRect(i, i, art.width, 40);
  ctx.strokeStyle = "rgba(30,15,10,0.5)";
  ctx.lineWidth = 3;
  ctx.strokeRect(i, i, art.width, art.height);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"));
}
