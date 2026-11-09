// Development-only stand-in for ConvexReactClient that talks to
// scripts/dev-backend.ts over HTTP (enabled with NEXT_PUBLIC_MP_DEV). It
// implements just what the gallery uses: watchQuery (for useQuery),
// mutation and connectionState. It polls for changes, so it's only for
// trying features locally, never a model of Convex's real-time behaviour.
import { getFunctionName, type FunctionReference } from "convex/server";

type Watch = { key: string; name: string; args: unknown; value: unknown; error: Error | null; listeners: Set<() => void> };

export class DevClient {
  private watches = new Map<string, Watch>();
  private version = -1;
  private connected = false;
  private timer: ReturnType<typeof setInterval>;

  constructor(private url: string) {
    this.timer = setInterval(() => void this.poll(), 250);
  }

  close() { clearInterval(this.timer); }

  connectionState() {
    return { isWebSocketConnected: this.connected, hasInflightRequests: false, timeOfOldestInflightRequest: null, hasEverConnected: true, connectionCount: 1, connectionRetries: 0, inflightMutations: 0, inflightActions: 0 };
  }

  watchQuery(query: FunctionReference<"query">, args: Record<string, unknown> = {}) {
    const name = getFunctionName(query);
    const key = `${name}:${JSON.stringify(args)}`;
    let w = this.watches.get(key);
    if (!w) {
      w = { key, name, args, value: undefined, error: null, listeners: new Set() };
      this.watches.set(key, w);
      void this.refresh(w);
    }
    const watch = w;
    return {
      onUpdate: (cb: () => void) => {
        watch.listeners.add(cb);
        return () => {
          watch.listeners.delete(cb);
          if (!watch.listeners.size) setTimeout(() => { if (!watch.listeners.size) this.watches.delete(key); }, 1000);
        };
      },
      localQueryResult: () => { if (watch.error) throw watch.error; return watch.value; },
      journal: () => undefined,
    };
  }

  async query(query: FunctionReference<"query">, args: Record<string, unknown> = {}) {
    return this.call("/query", getFunctionName(query), args);
  }

  async mutation(mutation: FunctionReference<"mutation">, args: Record<string, unknown> = {}) {
    const value = await this.call("/mutation", getFunctionName(mutation), args);
    void this.poll(true);
    return value;
  }

  private async call(path: string, name: string, args: unknown) {
    const res = await fetch(this.url + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, args }) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.value;
  }

  private async refresh(w: Watch) {
    try {
      const value = await this.call("/query", w.name, w.args);
      if (JSON.stringify(value) === JSON.stringify(w.value)) return;
      w.value = value; w.error = null;
    } catch (e) {
      w.error = e instanceof Error ? e : new Error(String(e));
    }
    w.listeners.forEach((l) => l());
  }

  private async poll(force = false) {
    try {
      const res = await fetch(this.url + "/version");
      const { version } = await res.json();
      this.connected = true;
      if (!force && version === this.version) return;
      this.version = version;
      await Promise.all([...this.watches.values()].map((w) => this.refresh(w)));
    } catch {
      this.connected = false;
    }
  }
}
