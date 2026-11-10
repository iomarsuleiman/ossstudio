"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, events as createPointerEvents, useThree } from "@react-three/fiber";
import { pickQuality } from "@/lib/quality";
import * as THREE from "three";
import type { GalleryContent, Locale, RoomId } from "@/content";
import type { WorldStore } from "@/lib/worldStore";
import { RoomScene } from "./RoomScene";
import { FirstPerson } from "./FirstPerson";
import { Figure } from "./Figure";
import { FrameDriver } from "./FrameDriver";
import { MouseLook } from "./MouseLook";
import { RemoteVisitors } from "./RemoteVisitors";
import type { NetStore } from "@/lib/multiplayer/net";
import { ATMOSPHERE } from "./atmosphere";
import { FOG } from "./paint";
import { RoomActive, isShown } from "./roomActive";

/** Rooms kept mounted after you leave them, by quality tier (bounded by GPU memory: ~50 MB of artwork textures per room). */
const KEEP_ROOMS = { high: 4, medium: 3, low: 2 } as const;

/** Background colour and fog follow the current room (one scene, several mounted rooms). */
function SceneAtmosphere({ roomId }: { roomId: RoomId }) {
  const { scene, invalidate } = useThree();
  const fog = useRef<THREE.Fog | null>(null);
  useEffect(() => {
    const a = ATMOSPHERE[roomId];
    // Reuse one Fog and one Color so switching rooms never recompiles materials.
    if (!fog.current) fog.current = new THREE.Fog(a.horizon, FOG.near, FOG.far);
    fog.current.color.set(a.horizon);
    scene.fog = fog.current;
    if (scene.background instanceof THREE.Color) scene.background.set(a.horizon);
    else scene.background = new THREE.Color(a.horizon);
    invalidate();
  }, [roomId, scene, invalidate]);
  return null;
}

export default function World({
  content, locale, roomId, store, net, onReady, onExhibitClick, onFloorClick, onMapRoom,
}: {
  net: NetStore;
  content: GalleryContent;
  locale: Locale;
  roomId: RoomId;
  store: WorldStore;
  onReady: () => void;
  onExhibitClick: (id: string) => void;
  onFloorClick: (x: number, z: number) => void;
  onMapRoom: (id: RoomId) => void;
}) {
  const room = content.rooms.find((r) => r.id === roomId)!;
  // Chosen once per page: antialiasing can't change after the canvas exists.
  const [quality] = useState(() => { const q = pickQuality(); store.quality = q.tier; return q; });

  // Most recently visited rooms first; the current room is always included.
  // Returning to one of these is a visibility switch, not a rebuild.
  const recent = useRef<RoomId[]>([]);
  if (recent.current[0] !== roomId) recent.current = [roomId, ...recent.current.filter((r) => r !== roomId)].slice(0, KEEP_ROOMS[quality.tier]);
  store.loadedRooms = recent.current;
  return (
    <Canvas
      className="world-canvas"
      dpr={1}
      frameloop="demand"
      camera={{ fov: 62, near: 0.05, far: 400, position: [0, 1.62, 8] }}
      gl={{ antialias: quality.antialias, powerPreference: "high-performance" }}
      onCreated={({ gl, camera, scene }) => {
        // `?debug` also exposes the camera and renderer, for automated walk-through and performance tests.
        if (new URLSearchParams(window.location.search).has("debug")) Object.assign(window, { __camera: camera, __three: { gl, scene, camera, THREE } });
        // Flat, true-to-paint colour: no filmic tone mapping.
        gl.toneMapping = THREE.NoToneMapping;
        requestAnimationFrame(() => onReady());
      }}
      // Hidden rooms share the same space as the current one: ignore hits on them.
      events={(s) => ({ ...createPointerEvents(s), filter: (hits) => hits.filter((h) => isShown(h.object)) })}
      aria-hidden="true"
    >
      <FrameDriver store={store} quality={quality} />
      <MouseLook store={store} />
      <SceneAtmosphere roomId={roomId} />
      {recent.current.map((id) => (
        <group key={id} visible={id === roomId}>
          <RoomActive.Provider value={id === roomId}>
            <RoomScene
              content={content}
              room={content.rooms.find((r) => r.id === id)!}
              locale={locale}
              store={store}
              onExhibitClick={onExhibitClick}
              onFloorClick={onFloorClick}
              onMapRoom={onMapRoom}
            />
          </RoomActive.Provider>
        </group>
      ))}
      {/* You, and the people around you, belong to the current room only. */}
      <group key={`here:${roomId}`}>
        <FirstPerson content={content} room={room} store={store} />
        <Figure store={store} atmosphere={ATMOSPHERE[room.id]} />
        <RemoteVisitors net={net} store={store} atmosphere={ATMOSPHERE[room.id]} />
      </group>
    </Canvas>
  );
}
