"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { DoorPlacement, ExhibitPlacement, GalleryContent, Room } from "@/content";
import type { WorldStore } from "@/lib/worldStore";
import { INSTALLATION_OFFSET, hasInstallation } from "./Installation";
import { INTRO_PANEL_INSET } from "./RoomScene";

// First-person movement with a graceful, weighted feel: you ease into a walk
// and drift to a stop, the view turns smoothly, and the camera sways and
// leans gently as you move. Walking only: there is no run, jump or physics.

const EYE = 1.62;
const WALK_SPEED = 2.0; // m/s
const ACCEL_TAU = 0.22; // ≈0.65 s to full speed: a soft start
const BRAKE_TAU = 0.3; // ≈0.9 s glide to a stop
const LOOK_TAU = 0.12; // look smoothing
const KEY_TURN = 1.5; // rad/s with the arrow keys
const RADIUS = 0.35;
const PITCH_MIN = -0.6;
const PITCH_MAX = 0.45;

const damp = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);
function angleDelta(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Collider { x: number; z: number; hx?: number; hz?: number; r?: number }

/** World-space centre of an artwork (sculptures sit forward of their mount). */
export function artworkCentre(e: ExhibitPlacement) {
  const nx = Math.sin(e.rotY), nz = Math.cos(e.rotY);
  if (e.kind === "pedestal") return new THREE.Vector3(e.x + nx * 0.35, 1.4, e.z + nz * 0.35);
  return new THREE.Vector3(e.x, e.y, e.z);
}

/** Yaw that faces an artwork from a given spot. */
export function yawToward(from: { x: number; z: number }, e: ExhibitPlacement) {
  const c = artworkCentre(e);
  return Math.atan2(c.x - from.x, c.z - from.z);
}

export function FirstPerson({ content, room, store }: { content: GalleryContent; room: Room; store: WorldStore }) {
  const { camera, gl } = useThree();
  const roll = useRef(0);
  const lastStep = useRef(0);
  const prevYaw = useRef(store.yaw);
  const clock = useRef(0);

  const shape = content.shapes.find((s) => s.roomId === room.id)!;
  const exhibits = useMemo(() => content.exhibits.filter((e) => e.roomId === room.id), [content, room.id]);
  const doors = useMemo(() => content.doors.filter((d) => d.roomId === room.id), [content, room.id]);
  const colliders = useMemo<Collider[]>(() => {
    const list: Collider[] = shape.benches.map((b) => ({ x: b.x, z: b.z, hx: 1.05, hz: 0.25 }));
    if (room.id === "main") list.push({ x: 0, z: 0, r: 1.75 });
    else list.push({ x: -shape.width / 2 + 2.0, z: shape.length / 2 - INTRO_PANEL_INSET, r: 1.1 });
    for (const e of exhibits) {
      const motif = content.projects.find((p) => p.slug === e.slug)?.motif;
      const nx = Math.sin(e.rotY), nz = Math.cos(e.rotY);
      if (e.kind === "pedestal") list.push({ x: e.x + nx * 0.35, z: e.z + nz * 0.35, r: 0.62 });
      else if (hasInstallation(motif)) list.push({ x: e.x + nx * INSTALLATION_OFFSET, z: e.z + nz * INSTALLATION_OFFSET, r: 0.48 });
    }
    return list;
  }, [shape, exhibits, content.projects, room.id]);

  // Drag anywhere on the world to look around.
  useEffect(() => {
    const el = gl.domElement;
    let active: number | null = null;
    let lx = 0, ly = 0;
    const down = (e: PointerEvent) => {
      if (active !== null || (e.pointerType === "mouse" && e.button !== 0)) return;
      active = e.pointerId;
      lx = e.clientX; ly = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== active || store.mode !== "walk") return;
      const sens = e.pointerType === "touch" ? 0.0055 : 0.0034;
      store.targetYaw -= (e.clientX - lx) * sens;
      store.targetPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, store.targetPitch - (e.clientY - ly) * sens));
      lx = e.clientX; ly = e.clientY;
    };
    const up = (e: PointerEvent) => { if (e.pointerId === active) active = null; };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [gl, store]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const s = store;
    if (s.roomId !== room.id) return; // the old room may tick once during a switch
    clock.current += dt;
    const persp = camera as THREE.PerspectiveCamera;
    const aspect = state.size.width / Math.max(1, state.size.height);
    const canWalk = s.mode === "walk";
    const reduced = s.reducedMotion;

    const enterTime = reduced ? 0.25 : 1.0;
    if (s.mode === "entering" || s.mode === "exhibit") s.enter = Math.min(1, s.enter + dt / enterTime);
    else if (s.enter > 0) {
      s.enter = Math.max(0, s.enter - dt / enterTime);
      if (s.enter === 0) s.entering = null;
    }

    // --- look ----------------------------------------------------------------
    const third = s.view === "third";
    s.viewBlend += ((third ? 1 : 0) - s.viewBlend) * damp(dt, reduced ? 0.05 : 0.45);
    if (canWalk) {
      if (s.keys.has("ArrowLeft")) s.targetYaw += KEY_TURN * dt;
      if (s.keys.has("ArrowRight")) s.targetYaw -= KEY_TURN * dt;
    }
    if (s.snapCamera) { s.yaw = s.targetYaw; s.pitch = s.targetPitch; }
    const lk = damp(dt, reduced ? 0.05 : LOOK_TAU);
    s.yaw += angleDelta(s.yaw, s.targetYaw) * lk;
    s.pitch += (s.targetPitch - s.pitch) * lk;

    // --- movement intent -------------------------------------------------------
    const fwd = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) };
    const right = { x: -Math.cos(s.yaw), z: Math.sin(s.yaw) };
    // Same controls in both views: walking is relative to where the camera looks.
    let f = 0, r = 0;
    if (canWalk) {
      if (s.keys.has("KeyW") || s.keys.has("ArrowUp")) f += 1;
      if (s.keys.has("KeyS") || s.keys.has("ArrowDown")) f -= 1;
      if (s.keys.has("KeyD")) r += 1;
      if (s.keys.has("KeyA")) r -= 1;
      f += s.joy.y;
      r += s.joy.x;
    }
    let want = { x: 0, z: 0 };
    if (f || r) {
      s.target = null;
      s.targetExhibit = null;
      const len = Math.max(1, Math.hypot(f, r));
      want = { x: ((fwd.x * f + right.x * r) / len) * WALK_SPEED, z: ((fwd.z * f + right.z * r) / len) * WALK_SPEED };
    } else if (s.target && canWalk) {
      const tx = s.target.x - s.pos.x, tz = s.target.z - s.pos.z;
      const dist = Math.hypot(tx, tz);
      if (dist < 0.1) {
        s.target = null;
        if (s.targetExhibit) {
          const e = exhibits.find((x) => x.id === s.targetExhibit);
          s.targetExhibit = null;
          if (e) s.onArrive?.(e);
        }
      } else {
        const sp = WALK_SPEED * Math.min(1, dist / 1.2);
        want = { x: (tx / dist) * sp, z: (tz / dist) * sp };
      }
    }

    const accelerating = Math.hypot(want.x, want.z) > Math.hypot(s.vel.x, s.vel.z);
    const k = damp(dt, accelerating ? ACCEL_TAU : BRAKE_TAU);
    s.vel.x += (want.x - s.vel.x) * k;
    s.vel.z += (want.z - s.vel.z) * k;
    let nx = s.pos.x + s.vel.x * dt;
    let nz = s.pos.z + s.vel.z * dt;

    if (canWalk) {
      const door = doorHit(doors, nx, nz, want, shape.width / 2, shape.length / 2);
      if (door) { s.mode = "transition"; s.onDoor?.(door); }
    }

    // Edges of the walkway, then props.
    const hx = shape.width / 2 - RADIUS, hz = shape.length / 2 - RADIUS;
    nx = Math.max(-hx, Math.min(hx, nx));
    nz = Math.max(-hz, Math.min(hz, nz));
    for (const c of colliders) {
      if (c.r !== undefined) {
        const ox = nx - c.x, oz = nz - c.z, d = Math.hypot(ox, oz), min = c.r + RADIUS;
        if (d < min && d > 1e-4) { nx = c.x + (ox / d) * min; nz = c.z + (oz / d) * min; }
      } else {
        const px = c.hx! + RADIUS - Math.abs(nx - c.x), pz = c.hz! + RADIUS - Math.abs(nz - c.z);
        if (px > 0 && pz > 0) {
          if (px < pz) nx += Math.sign(nx - c.x || 1) * px; else nz += Math.sign(nz - c.z || 1) * pz;
        }
      }
    }
    s.vel.x = (nx - s.pos.x) / dt;
    s.vel.z = (nz - s.pos.z) / dt;
    s.pos.x = nx;
    s.pos.z = nz;
    const speed = Math.hypot(s.vel.x, s.vel.z);
    const speedN = Math.min(1, speed / WALK_SPEED);

    // The figure (seen in third person) turns gracefully to face where it walks;
    // standing still it keeps its heading.
    if (speed > 0.15) s.bodyYaw += angleDelta(s.bodyYaw, Math.atan2(s.vel.x, s.vel.z)) * damp(dt, 0.12);
    if (s.snapCamera || !third) s.bodyYaw = s.yaw;

    // --- what you're looking at ------------------------------------------------------
    let best: ExhibitPlacement | null = null, bestScore = Infinity;
    for (const e of exhibits) {
      const c = artworkCentre(e);
      const dx = c.x - s.pos.x, dz = c.z - s.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 5.2 || d < 0.3) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fwd.x + dz * fwd.z) / d)));
      // Close up you can be looking roughly its way; from further off, look at it.
      if (ang > (d < 3 ? 0.8 : 0.45)) continue;
      const score = ang + d * 0.12;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (s.mode === "walk" && best?.id !== s.nearby?.id) {
      s.nearby = best;
      s.onNearby?.(best);
    }
    const nearMap = room.id === "main" && Math.hypot(s.pos.x, s.pos.z) < 4.4;
    if (nearMap !== s.nearMap && s.mode === "walk") { s.nearMap = nearMap; s.onNearMap?.(nearMap); }

    // --- footsteps and body motion --------------------------------------------------------
    s.walkPhase += speed * dt * 4.6;
    if (speed > 0.6 && Math.floor(s.walkPhase / Math.PI) !== lastStep.current) {
      lastStep.current = Math.floor(s.walkPhase / Math.PI);
      s.onStep?.();
    }
    const yawVel = angleDelta(prevYaw.current, s.yaw) / Math.max(dt, 1e-3);
    prevYaw.current = s.yaw;
    const lateral = s.vel.x * right.x + s.vel.z * right.z;
    const rollTarget = reduced ? 0 : Math.max(-0.05, Math.min(0.05, yawVel * 0.022 - lateral * 0.012));
    roll.current += (rollTarget - roll.current) * damp(dt, 0.25);
    const bob = reduced ? 0 : Math.sin(s.walkPhase * 2) * 0.026 * speedN;
    const sway = reduced ? 0 : Math.sin(s.walkPhase) * 0.018 * speedN;

    // --- camera pose ------------------------------------------------------------------------
    const baseFov = third ? (aspect < 1 ? 70 : 58) : aspect < 1 ? 74 : 62;
    const fov = baseFov + (reduced ? 0 : speedN * 2.5);
    if (Math.abs(persp.fov - fov) > 0.01) { persp.fov += (fov - persp.fov) * damp(dt, 0.4); persp.updateProjectionMatrix(); }

    // First-person pose: eye position and a point straight ahead.
    const eye = new THREE.Vector3(s.pos.x + right.x * sway, EYE + bob, s.pos.z + right.z * sway);
    const cp = Math.cos(s.pitch);
    const ahead = eye.clone().add(new THREE.Vector3(Math.sin(s.yaw) * cp, Math.sin(s.pitch), Math.cos(s.yaw) * cp));

    // Third-person pose: behind and a little above the figure, looking where
    // you look. Dragging up/down tilts the camera around the figure.
    const back = aspect < 1 ? 4.6 : 4.0;
    const camY = Math.max(0.9, Math.min(4.2, 2.25 - s.pitch * 2.4));
    const chase = new THREE.Vector3(s.pos.x - Math.sin(s.yaw) * back, camY, s.pos.z - Math.cos(s.yaw) * back);
    // Keep the camera over the walkway, clear of the artwork panels at its edges.
    chase.x = Math.max(-shape.width / 2 + 0.7, Math.min(shape.width / 2 - 0.7, chase.x));
    chase.z = Math.max(-shape.length / 2 + 0.4, Math.min(shape.length / 2 - 0.4, chase.z));
    const focus = new THREE.Vector3(s.pos.x + Math.sin(s.yaw) * 2.2, 1.25 + s.pitch * 2.2, s.pos.z + Math.cos(s.yaw) * 2.2);

    const vb = ease(Math.min(1, Math.max(0, s.viewBlend)));
    const pos = eye.clone().lerp(chase, vb);
    const look = ahead.clone().lerp(focus, vb);
    let rl = roll.current * (1 - vb);

    if (s.entering && s.enter > 0) {
      const e = ease(s.enter);
      const c = artworkCentre(s.entering);
      const n = { x: Math.sin(s.entering.rotY), z: Math.cos(s.entering.rotY) };
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(persp.fov / 2));
      const d = Math.max(s.entering.h / 2 / tanHalf, s.entering.w / 2 / (tanHalf * aspect)) * 1.04;
      pos.lerp(new THREE.Vector3(c.x + n.x * d, c.y, c.z + n.z * d), e);
      look.lerp(c, e);
      rl *= 1 - e;
    }

    if (persp.near !== 0.05) { persp.near = 0.05; persp.updateProjectionMatrix(); }

    camera.position.copy(pos);
    camera.lookAt(look);
    camera.rotateZ(rl);
    s.snapCamera = false;
  });

  return null;
}

function doorHit(doors: DoorPlacement[], x: number, z: number, vel: { x: number; z: number }, hw: number, hl: number) {
  const edge = 0.45;
  for (const d of doors) {
    if (d.side === "left" && x < -hw + edge && Math.abs(z - d.z) < 1.2 && vel.x < -0.3) return d;
    if (d.side === "right" && x > hw - edge && Math.abs(z - d.z) < 1.2 && vel.x > 0.3) return d;
    if (d.side === "front" && z < -hl + edge && Math.abs(x - d.x) < 1.2 && vel.z < -0.3) return d;
    if (d.side === "back" && z > hl - edge && Math.abs(x - d.x) < 1.2 && vel.z > 0.3) return d;
  }
  return null;
}
