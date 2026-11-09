// Smooth, rounded geometry builders: arches drawn as one continuous tube,
// arched panels and bevelled frames. High curve segment counts keep every
// silhouette soft.
import * as THREE from "three";

/** A single arch outline (legs + semicircle) as a smooth tube. */
export function archTube(width: number, height: number, radius = 0.12) {
  const r = width / 2;
  const legTop = height - r;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3(-r, (legTop * i) / 12, 0));
  for (let i = 1; i < 40; i++) {
    const a = Math.PI - (Math.PI * i) / 40;
    pts.push(new THREE.Vector3(Math.cos(a) * r, legTop + Math.sin(a) * r, 0));
  }
  for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3(r, legTop - (legTop * i) / 12, 0));
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  // 96×8 segments look identical at walking distance to the old 160×12 (unlit, smooth normals).
  return new THREE.TubeGeometry(curve, 96, radius, 8, false);
}

/** Arched-top outline from y=0 to `height`. */
export function archShape(width: number, height: number) {
  const r = width / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(-r, height - r);
  s.absarc(0, height - r, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.closePath();
  return s;
}

export function roundedRect(w: number, h: number, r: number, cx = 0, cy = 0) {
  const s = new THREE.Shape();
  const x = cx - w / 2, y = cy - h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/**
 * Arched panel that an artwork hangs on. Panels of the same size share one
 * geometry (a room has only two or three sizes), kept for the page's life.
 */
const steleCache = new Map<string, THREE.ExtrudeGeometry>();
export function steleGeometry(width: number, height: number, depth = 0.16) {
  const key = `${width.toFixed(3)}:${height.toFixed(3)}:${depth}`;
  let g = steleCache.get(key);
  if (!g) {
    g = new THREE.ExtrudeGeometry(archShape(width, height), {
      depth, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 28,
    });
    g.dispose = () => {};
    steleCache.set(key, g);
  }
  return g;
}

/** Rounded picture frame with a hole for the canvas (shared per size, like panels). */
const frameCache = new Map<string, THREE.ExtrudeGeometry>();
export function frameGeometry(w: number, h: number, border = 0.1) {
  const key = `${w.toFixed(3)}:${h.toFixed(3)}:${border}`;
  let g = frameCache.get(key);
  if (!g) {
    g = buildFrame(w, h, border);
    g.dispose = () => {};
    frameCache.set(key, g);
  }
  return g;
}

function buildFrame(w: number, h: number, border: number) {
  const outer = roundedRect(w + border * 2, h + border * 2, 0.06);
  outer.holes.push(roundedRect(w, h, 0.02) as unknown as THREE.Path);
  return new THREE.ExtrudeGeometry(outer, {
    depth: 0.05, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 6,
  });
}

/** Thin slab with very rounded corners: the walkway floating on the water. */
export function slabGeometry(w: number, l: number, radius: number, depth = 0.35) {
  return new THREE.ExtrudeGeometry(roundedRect(w, l, radius), {
    depth, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.2, bevelSegments: 6, curveSegments: 32,
  });
}

/** Wide soft hill silhouette for distant layers. */
export function hillShape(width: number, height: number, bumps: number, seed: () => number) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, -2);
  const steps = 60;
  const phase = seed() * 6, f2 = 1 + seed() * 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const env = Math.sin(t * Math.PI);
    const y = height * env * (0.6 + 0.4 * Math.sin(t * Math.PI * bumps + phase)) + height * 0.15 * Math.sin(t * Math.PI * bumps * f2);
    s.lineTo(-width / 2 + t * width, Math.max(0, y));
  }
  s.lineTo(width / 2, -2);
  s.closePath();
  return s;
}
