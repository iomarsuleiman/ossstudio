import { createContext, useContext } from "react";

/**
 * Recently visited rooms stay mounted (hidden) so going back is instant.
 * Their per-frame work checks this and skips itself while hidden.
 */
export const RoomActive = createContext(true);
export const useRoomActive = () => useContext(RoomActive);

/** True when an object and all its ancestors are visible (hidden rooms aren't). */
export function isShown(o: { visible: boolean; parent: unknown } | null): boolean {
  for (let n = o as { visible: boolean; parent: unknown } | null; n; n = n.parent as typeof n) if (!n.visible) return false;
  return true;
}
