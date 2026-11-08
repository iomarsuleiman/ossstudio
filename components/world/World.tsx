"use client";

import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import type { GalleryContent, Locale, RoomId } from "@/content";
import type { WorldStore } from "@/lib/worldStore";
import { RoomScene } from "./RoomScene";
import { Visitor } from "./Visitor";

export default function World({
  content, locale, roomId, store, onReady, onExhibitClick, onFloorClick,
}: {
  content: GalleryContent;
  locale: Locale;
  roomId: RoomId;
  store: WorldStore;
  onReady: () => void;
  onExhibitClick: (id: string) => void;
  onFloorClick: (x: number, z: number) => void;
}) {
  const room = content.rooms.find((r) => r.id === roomId)!;
  return (
    <Canvas
      className="world-canvas"
      dpr={[1, 1.75]}
      camera={{ fov: 45, near: 0.1, far: 90, position: [0, 3, 8] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        requestAnimationFrame(() => onReady());
      }}
      aria-hidden="true"
    >
      <group key={roomId}>
        <RoomScene
          content={content}
          room={room}
          locale={locale}
          store={store}
          onExhibitClick={onExhibitClick}
          onFloorClick={onFloorClick}
        />
        <Visitor content={content} room={room} store={store} />
      </group>
    </Canvas>
  );
}
