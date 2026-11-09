// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const token = (n: number) => `queue-token-${n}-abcdefghijklmnop`;
const at = { x: 0, z: 0, yaw: 0 };
const OWNER = "owner-secret-key-0123456789abcdef";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("GALLERY_CAPACITY", "3");
  vi.stubEnv("QUEUE_OWNER_KEY", OWNER);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

async function full() {
  const t = convexTest(schema, modules);
  for (let i = 0; i < 3; i++) {
    expect(await t.mutation(api.queue.request, { token: token(i) })).toEqual({ admitted: true });
    await t.mutation(api.presence.join, { token: token(i), roomId: "main", ...at });
  }
  return t;
}

describe("capacity and the waiting line", () => {
  it("lets people straight in until full, then queues them in order", async () => {
    const t = await full();
    for (let i = 3; i < 6; i++) expect(await t.mutation(api.queue.request, { token: token(i) })).toEqual({ admitted: false });
    expect(await t.query(api.queue.status, { token: token(3) })).toMatchObject({ inLine: true, position: 1, waiting: 3 });
    expect(await t.query(api.queue.status, { token: token(5) })).toMatchObject({ position: 3 });
    expect(await t.query(api.queue.capacityInfo, {})).toEqual({ capacity: 3, inside: 3, waiting: 3 });
  });

  it("refuses to let anyone join past the limit or cut the line", async () => {
    const t = await full();
    await expect(t.mutation(api.presence.join, { token: token(9), roomId: "main", ...at })).rejects.toThrow(/full/);
    await t.mutation(api.presence.leave, { token: token(0) });
    await t.mutation(api.queue.request, { token: token(3) });
    // Room has freed up, but someone is waiting: a newcomer can't jump ahead.
    await expect(t.mutation(api.presence.join, { token: token(10), roomId: "main", ...at })).rejects.toThrow(/full/);
  });

  it("admits the next in line as people leave", async () => {
    const t = await full();
    await t.mutation(api.queue.request, { token: token(3) });
    await t.mutation(api.queue.request, { token: token(4) });
    await t.mutation(api.presence.leave, { token: token(0) });
    expect(await t.mutation(internal.queue.admit, {})).toEqual({ admitted: 1, waiting: 1 });
    expect(await t.query(api.queue.status, { token: token(3) })).toMatchObject({ admitted: true });
    expect(await t.query(api.queue.status, { token: token(4) })).toMatchObject({ position: 1 });
    await t.mutation(api.presence.join, { token: token(3), roomId: "main", ...at });
    expect((await t.query(api.presence.counts, {})).total).toBe(3);
  });

  it("gives up the place of a tab that stopped pinging", async () => {
    const t = await full();
    await t.mutation(api.queue.request, { token: token(3) });
    await t.mutation(api.queue.request, { token: token(4) });
    vi.setSystemTime(Date.now() + 90_000);
    await t.mutation(api.queue.ping, { token: token(4) });
    await t.mutation(api.presence.leave, { token: token(0) });
    await t.mutation(internal.queue.admit, {});
    expect(await t.query(api.queue.status, { token: token(3) })).toMatchObject({ inLine: false, admitted: false });
    expect(await t.query(api.queue.status, { token: token(4) })).toMatchObject({ admitted: true });
  });

  it("an admitted visitor who never arrives frees the slot", async () => {
    const t = await full();
    await t.mutation(api.queue.request, { token: token(3) });
    await t.mutation(api.presence.leave, { token: token(0) });
    await t.mutation(internal.queue.admit, {});
    await t.mutation(api.queue.request, { token: token(4) });
    vi.setSystemTime(Date.now() + 130_000);
    await t.mutation(api.queue.ping, { token: token(4) }); // still waiting with the tab open
    await t.mutation(internal.queue.admit, {});
    expect(await t.query(api.queue.status, { token: token(4) })).toMatchObject({ admitted: true });
  });

  it("the owner can move 5 places forward, or straight in; nobody else can", async () => {
    const t = await full();
    for (let i = 3; i < 13; i++) await t.mutation(api.queue.request, { token: token(i) });
    const me = token(12);
    expect(await t.query(api.queue.status, { token: me })).toMatchObject({ position: 10 });
    expect(await t.mutation(api.queue.skip, { token: me, key: "wrong-key-wrong-key-wrong-key-xx", all: false })).toEqual({ ok: false });
    expect(await t.query(api.queue.status, { token: me })).toMatchObject({ position: 10 });
    expect(await t.mutation(api.queue.skip, { token: me, key: OWNER, all: false })).toEqual({ ok: true });
    expect(await t.query(api.queue.status, { token: me })).toMatchObject({ position: 5 });
    await t.mutation(api.queue.skip, { token: me, key: OWNER, all: false });
    expect(await t.query(api.queue.status, { token: me })).toMatchObject({ position: 1 });
    // Admission order follows the new place in line.
    await t.mutation(api.presence.leave, { token: token(0) });
    await t.mutation(internal.queue.admit, {});
    expect(await t.query(api.queue.status, { token: me })).toMatchObject({ admitted: true });
    // Skipping the whole line works even when the gallery is full.
    await t.mutation(api.presence.join, { token: me, roomId: "main", ...at });
    const other = token(11);
    expect(await t.mutation(api.queue.skip, { token: other, key: OWNER, all: true })).toEqual({ ok: true });
    await t.mutation(api.presence.join, { token: other, roomId: "main", ...at });
    expect((await t.query(api.presence.counts, {})).total).toBe(4);
  });

  it("the skip is off entirely when no owner key is configured", async () => {
    vi.stubEnv("QUEUE_OWNER_KEY", "");
    const t = await full();
    await t.mutation(api.queue.request, { token: token(3) });
    expect(await t.mutation(api.queue.skip, { token: token(3), key: "", all: true })).toEqual({ ok: false });
  });
});
