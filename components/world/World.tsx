"use client";

import { useState } from "react";
import { Canvas } from "@react-three/fiber";
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

export default function World({
  content, locale, roomId, store, net, onReady, onExhibitClick, onFloorClick, onMapRoom, onChatWith,
}: {
  net: NetStore;
  onChatWith: (visitorId: string) => void;
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
  return (
    <Canvas
      className="world-canvas"
      dpr={1}
      frameloop="demand"
      camera={{ fov: 62, near: 0.05, far: 400, position: [0, 1.62, 8] }}
      gl={{ antialias: quality.antialias, powerPreference: "high-performance" }}
      onCreated={({ gl, camera, scene }) => {
        // `?debug` also exposes the camera and renderer, for automated walk-through and performance tests.
        if (new URLSearchParams(window.location.search).has("debug")) Object.assign(window, { __camera: camera, __three: { gl, scene, camera } });
        // Flat, true-to-paint colour: no filmic tone mapping.
        gl.toneMapping = THREE.NoToneMapping;
        requestAnimationFrame(() => onReady());
      }}
      aria-hidden="true"
    >
      <FrameDriver store={store} quality={quality} />
      <MouseLook store={store} />
      <group key={roomId}>
        <RoomScene
          content={content}
          room={room}
          locale={locale}
          store={store}
          onExhibitClick={onExhibitClick}
          onFloorClick={onFloorClick}
          onMapRoom={onMapRoom}
        />
        <FirstPerson content={content} room={room} store={store} />
        <Figure store={store} atmosphere={ATMOSPHERE[room.id]} />
        <RemoteVisitors net={net} store={store} atmosphere={ATMOSPHERE[room.id]} onChat={onChatWith} />
      </group>
    </Canvas>
  );
}
