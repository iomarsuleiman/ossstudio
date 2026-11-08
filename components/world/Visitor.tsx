"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { DoorPlacement, ExhibitPlacement, GalleryContent, Room } from "@/content";
import type { WorldStore } from "@/lib/worldStore";
import { INSTALLATION_OFFSET, hasInstallation } from "./Installation";
import { INTRO_PANEL_INSET } from "./RoomScene";

// Movement tuning (first-playtest values from the plan).
const WALK_SPEED = 1.9; // m/s, walking only — there is no run
const ACCEL_TAU = 0.1; // ≈0.3 s to reach full speed
const BRAKE_TAU = 0.075; // ≈0.22 s to stop
const TURN_TAU = 0.085; // ≈0.25 s for a comfortable turn
const RADIUS = 0.35;
const NEAR_DIST = 1.9;
const CAM_TAU = 0.38;

const damp = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);
function angleLerp(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Collider { x: number; z: number; hx?: number; hz?: number; r?: number }

export function Visitor({ content, room, store }: { content: GalleryContent; room: Room; store: WorldStore }) {
  const { camera } = useThree();
  const body = useRef<THREE.Group>(null);
  const dress = useRef<THREE.Mesh>(null);
  const scarf = useRef<THREE.Mesh>(null);
  const marker = useRef<THREE.Mesh>(null);
  const lookAt = useRef(new THREE.Vector3());
  const lastStep = useRef(0);

  const shape = content.shapes.find((s) => s.roomId === room.id)!;
  const exhibits = useMemo(() => content.exhibits.filter((e) => e.roomId === room.id), [content, room.id]);
  const doors = useMemo(() => content.doors.filter((d) => d.roomId === room.id), [content, room.id]);
  const colliders = useMemo<Collider[]>(() => {
    const list: Collider[] = shape.benches.map((b) => ({ x: b.x, z: b.z, hx: 1.0, hz: 0.3 }));
    if (room.id === "main") list.push({ x: 0, z: 0, r: 2.2 });
    else list.push({ x: 0, z: shape.length / 2 - INTRO_PANEL_INSET, hx: 1.3, hz: 0.25 });
    for (const e of exhibits) {
      const motif = content.projects.find((p) => p.slug === e.slug)?.motif;
      const nx = Math.sin(e.rotY), nz = Math.cos(e.rotY);
      if (e.kind === "pedestal") list.push({ x: e.x + nx * 0.35, z: e.z + nz * 0.35, r: 0.65 });
      else if (hasInstallation(motif)) list.push({ x: e.x + nx * INSTALLATION_OFFSET, z: e.z + nz * INSTALLATION_OFFSET, r: 0.48 });
    }
    return list;
  }, [shape, exhibits, content.projects, room.id]);

  const dressGeo = useMemo(() => {
    const pts = [
      new THREE.Vector2(0.0, 0.0), new THREE.Vector2(0.34, 0.0), new THREE.Vector2(0.3, 0.12),
      new THREE.Vector2(0.22, 0.45), new THREE.Vector2(0.15, 0.78), new THREE.Vector2(0.12, 0.92),
      new THREE.Vector2(0.0, 0.95),
    ];
    return new THREE.LatheGeometry(pts, 24);
  }, []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const s = store;
    // During a room switch the old room's loop may run once more; ignore it.
    if (s.roomId !== room.id) return;
    const half = { x: shape.width / 2 - RADIUS, z: shape.length / 2 - RADIUS };
    const canWalk = s.mode === "walk";
    // Painting entry/exit camera move (timed by the UI, animated here).
    const enterTime = s.reducedMotion ? 0.25 : 0.95;
    if (s.mode === "entering" || s.mode === "exhibit") s.enter = Math.min(1, s.enter + dt / enterTime);
    else if (s.enter > 0) {
      s.enter = Math.max(0, s.enter - dt / enterTime);
      if (s.enter === 0) s.entering = null;
    }

    // --- input -------------------------------------------------------------
    let ix = 0, iz = 0;
    if (canWalk) {
      if (s.keys.has("KeyW") || s.keys.has("ArrowUp")) iz -= 1;
      if (s.keys.has("KeyS") || s.keys.has("ArrowDown")) iz += 1;
      if (s.keys.has("KeyA") || s.keys.has("ArrowLeft")) ix -= 1;
      if (s.keys.has("KeyD") || s.keys.has("ArrowRight")) ix += 1;
    }
    if (ix || iz) { s.target = null; s.targetExhibit = null; }
    let dx = 0, dz = 0, scale = 1;
    if (ix || iz) {
      const len = Math.hypot(ix, iz);
      dx = ix / len; dz = iz / len;
    } else if (s.target && canWalk) {
      const tx = s.target.x - s.pos.x, tz = s.target.z - s.pos.z;
      const dist = Math.hypot(tx, tz);
      if (dist < 0.12) {
        s.target = null;
        if (s.targetExhibit) {
          const e = exhibits.find((x) => x.id === s.targetExhibit);
          s.targetExhibit = null;
          if (e) { s.yaw = angleLerp(s.yaw, e.spawn.yaw, 1); s.linger = 1; s.onArrive?.(e); }
        }
      } else {
        dx = tx / dist; dz = tz / dist; scale = Math.min(1, dist / 0.7);
      }
    }

    // --- kinematic movement ------------------------------------------------------
    const want = { x: dx * WALK_SPEED * scale, z: dz * WALK_SPEED * scale };
    const accelerating = Math.hypot(want.x, want.z) > Math.hypot(s.vel.x, s.vel.z);
    const k = damp(dt, accelerating ? ACCEL_TAU : BRAKE_TAU);
    s.vel.x += (want.x - s.vel.x) * k;
    s.vel.z += (want.z - s.vel.z) * k;
    let nx = s.pos.x + s.vel.x * dt;
    let nz = s.pos.z + s.vel.z * dt;

    // Door triggers: pressing into a doorway walks through it.
    if (canWalk) {
      const door = doorHit(doors, nx, nz, want, shape.width / 2, shape.length / 2);
      if (door) { s.mode = "transition"; s.onDoor?.(door); }
    }

    // Walls: clamping gives natural wall sliding.
    nx = Math.max(-half.x, Math.min(half.x, nx));
    nz = Math.max(-half.z, Math.min(half.z, nz));
    // Props.
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
    s.pos.x = nx; s.pos.z = nz;
    const speed = Math.hypot(s.vel.x, s.vel.z);
    if (speed > 0.08) s.yaw = angleLerp(s.yaw, Math.atan2(s.vel.x, s.vel.z), damp(dt, TURN_TAU));

    // --- nearby artwork ------------------------------------------------------------
    let best: ExhibitPlacement | null = null, bestD = NEAR_DIST;
    for (const e of exhibits) {
      const d = Math.hypot(e.spawn.x - s.pos.x, e.spawn.z - s.pos.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (s.mode === "walk" && best?.id !== s.nearby?.id) {
      s.nearby = best;
      s.linger = 0;
      s.onNearby?.(best);
    }
    s.linger = s.nearby && speed < 0.2 ? s.linger + dt : 0;
    const focusWanted = !s.reducedMotion && s.nearby && s.linger > 0.35 ? 1 : 0;
    s.focusBlend += (focusWanted - s.focusBlend) * damp(dt, 0.7);

    // --- character animation ----------------------------------------------------
    s.walkPhase += speed * dt * 4.4;
    if (body.current) {
      body.current.position.set(s.pos.x, Math.abs(Math.sin(s.walkPhase)) * 0.035 * Math.min(1, speed), s.pos.z);
      body.current.rotation.y = s.yaw;
    }
    if (dress.current) dress.current.rotation.x = -Math.min(0.12, speed * 0.05);
    if (scarf.current) scarf.current.rotation.x = 0.25 + speed * 0.35 + Math.sin(s.walkPhase * 0.9) * 0.06;
    if (speed > 0.6 && Math.floor(s.walkPhase / Math.PI) !== lastStep.current) {
      lastStep.current = Math.floor(s.walkPhase / Math.PI);
      s.onStep?.();
    }
    if (marker.current) {
      marker.current.visible = !!s.target;
      if (s.target) marker.current.position.set(s.target.x, 0.03, s.target.z);
    }

    // --- camera ------------------------------------------------------------------------
    // Small figure in a large composed space: camera high and well behind.
    // Portrait screens see a narrow slice of the hall, so the camera pulls back.
    const aspect = state.size.width / Math.max(1, state.size.height);
    const zoom = aspect < 1 ? Math.min(1.4, Math.pow(1 / aspect, 0.35)) : 1;
    const persp = camera as THREE.PerspectiveCamera;
    const fov = aspect < 1 ? 58 : 45;
    if (persp.fov !== fov) { persp.fov = fov; persp.updateProjectionMatrix(); }
    const back = 9.5 * zoom;
    const follow = new THREE.Vector3(s.pos.x * 0.6 + 1.0, 4.4, s.pos.z + back);
    follow.z = Math.min(follow.z, shape.length / 2 - 0.4);
    // Pressed against the back wall: rise a little and look further ahead
    // so the view stays on the hall rather than tilting down at the floor.
    const overshoot = Math.max(0, s.pos.z + back - follow.z);
    follow.y += overshoot * 0.12;
    follow.x = Math.max(-shape.width / 2 + 0.6, Math.min(shape.width / 2 - 0.6, follow.x));
    const ahead = 2.8 + overshoot * 0.15 + (zoom - 1) * 4;
    const followLook = new THREE.Vector3(s.pos.x * 0.8, 0.9 + (zoom - 1) * 1.5, s.pos.z - ahead);

    const desired = follow.clone();
    const look = followLook.clone();
    const focusE = s.entering ?? s.nearby;
    if (focusE) {
      const n = new THREE.Vector3(Math.sin(focusE.rotY), 0, Math.cos(focusE.rotY));
      const centre = new THREE.Vector3(focusE.x, focusE.y, focusE.z);
      if (focusE.kind === "pedestal") centre.add(n.clone().multiplyScalar(0.35)).setY(1.2);
      const fb = s.entering ? 1 : s.focusBlend;
      if (fb > 0.001) {
        const shot = centre.clone().add(n.clone().multiplyScalar(4.4 * zoom)).add(new THREE.Vector3(0, 0.5, 0));
        desired.lerp(shot, fb);
        look.lerp(centre, fb);
      }
      if (s.entering) {
        const e = ease(s.enter);
        const tanHalf = Math.tan(THREE.MathUtils.degToRad(fov / 2));
        const dist = Math.max(focusE.h / 2 / tanHalf, focusE.w / 2 / (tanHalf * aspect)) * 1.02;
        const into = centre.clone().add(n.multiplyScalar(dist));
        desired.lerp(into, e);
        look.lerp(centre, e);
      }
    }
    if (s.snapCamera) {
      camera.position.copy(desired);
      lookAt.current.copy(look);
      s.snapCamera = false;
    } else {
      const tau = s.reducedMotion ? 0.05 : s.entering ? 0.12 : CAM_TAU;
      camera.position.lerp(desired, damp(dt, tau));
      lookAt.current.lerp(look, damp(dt, tau * 0.8));
    }
    camera.lookAt(lookAt.current);
  });

  return (
    <>
      <group ref={body}>
        <mesh ref={dress} geometry={dressGeo} scale={[1, 1.05, 1]}>
          <meshLambertMaterial color="#86394a" flatShading />
        </mesh>
        <mesh position={[0, 1.08, 0]}>
          <sphereGeometry args={[0.15, 20, 16]} />
          <meshLambertMaterial color="#f1dfc8" />
        </mesh>
        <mesh position={[0, 1.13, -0.03]} scale={[1.08, 1, 1.12]}>
          <sphereGeometry args={[0.155, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          <meshLambertMaterial color="#3d3737" />
        </mesh>
        <mesh ref={scarf} position={[0, 0.92, -0.12]}>
          <boxGeometry args={[0.1, 0.02, 0.55]} />
          <meshLambertMaterial color="#d8a39e" />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
          <circleGeometry args={[0.42, 24]} />
          <meshBasicMaterial color="#3d2b2b" transparent opacity={0.18} depthWrite={false} />
        </mesh>
      </group>
      <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.18, 0.24, 32]} />
        <meshBasicMaterial color={room.palette.accent} transparent opacity={0.7} depthWrite={false} />
      </mesh>
    </>
  );
}

function doorHit(doors: DoorPlacement[], x: number, z: number, vel: { x: number; z: number }, hw: number, hl: number) {
  const edge = 0.45;
  for (const d of doors) {
    if (d.side === "left" && x < -hw + edge && Math.abs(z - d.z) < 1.0 && vel.x < -0.3) return d;
    if (d.side === "right" && x > hw - edge && Math.abs(z - d.z) < 1.0 && vel.x > 0.3) return d;
    if (d.side === "front" && z < -hl + edge && Math.abs(x - d.x) < 1.0 && vel.z < -0.3) return d;
    if (d.side === "back" && z > hl - edge && Math.abs(x - d.x) < 1.0 && vel.z > 0.3) return d;
  }
  return null;
}
