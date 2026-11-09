"use client";

import { Canvas } from "@react-three/fiber";
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
  return (
    <Canvas
      className="world-canvas"
      dpr={1}
      frameloop="demand"
      camera={{ fov: 62, near: 0.05, far: 400, position: [0, 1.62, 8] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl, camera }) => {
        // `?debug` also exposes the camera, for automated walk-through tests.
        if (new URLSearchParams(window.location.search).has("debug")) (window as unknown as { __camera: unknown }).__camera = camera;
        // Flat, true-to-paint colour: no filmic tone mapping.
        gl.toneMapping = THREE.NoToneMapping;
        requestAnimationFrame(() => onReady());
      }}
      aria-hidden="true"
    >
      <FrameDriver store={store} />
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
