"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { WorldStore } from "@/lib/worldStore";
import { isShown } from "./roomActive";

// While mouse look (pointer lock) is engaged the cursor is hidden and fixed,
// so a click means "whatever is under the crosshair": cast a ray from the
// centre of the screen and activate the first interactive object it hits
// (anything with `userData.onActivate`: artworks, benches, the floor, people).

/** Return false to let the click pass through to whatever is behind. */
type Activate = (point: THREE.Vector3) => boolean | void;

export function MouseLook({ store }: { store: WorldStore }) {
  const { gl, scene, camera } = useThree();
  const ray = useMemo(() => new THREE.Raycaster(undefined, undefined, 0.05, 40), []);
  const centre = useMemo(() => new THREE.Vector2(0, 0), []);

  useEffect(() => {
    const el = gl.domElement;
    const click = (e: MouseEvent) => {
      if (!store.pointerLocked || e.button !== 0 || store.mode !== "walk") return;
      ray.setFromCamera(centre, camera);
      for (const hit of ray.intersectObjects(scene.children, true)) {
        if (!isShown(hit.object)) continue; // a hidden, recently visited room
        let o: THREE.Object3D | null = hit.object;
        while (o && !o.userData.onActivate) o = o.parent;
        if (o && (o.userData.onActivate as Activate)(hit.point) !== false) return;
      }
    };
    el.addEventListener("mousedown", click);
    return () => el.removeEventListener("mousedown", click);
  }, [gl, scene, camera, ray, centre, store]);

  return null;
}
