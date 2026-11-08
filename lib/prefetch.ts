// Whole-site background preparation. Starts once the entrance is interactive,
// never waits for hover or intent, and keeps going until every first-party
// item has been attempted. Teleporting re-prioritises a room but never
// cancels the queue.

export interface PrefetchTask {
  key: string;
  group: "assets" | "routes" | "artworks";
  priority: number;
  /** Larger downloads are paused when the visitor asks to save data. */
  heavy?: boolean;
  run: () => Promise<unknown>;
}

export interface PrefetchState {
  total: number;
  done: number;
  failed: number;
  artworksTotal: number;
  artworksDone: number;
  paused: boolean;
  finished: boolean;
}

type Listener = (s: PrefetchState) => void;

const idle = () =>
  new Promise<void>((resolve) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
    if (w.requestIdleCallback) w.requestIdleCallback(() => resolve(), { timeout: 400 });
    else setTimeout(resolve, 16);
  });

export class PrefetchQueue {
  private pending: PrefetchTask[] = [];
  private running = 0;
  private retrying = 0;
  private listeners = new Set<Listener>();
  private attempts = new Map<string, number>();
  state: PrefetchState = {
    total: 0, done: 0, failed: 0, artworksTotal: 0, artworksDone: 0, paused: false, finished: false,
  };

  constructor(private concurrency = 2) {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData || conn?.effectiveType === "slow-2g" || conn?.effectiveType === "2g") this.state.paused = true;
  }

  add(tasks: PrefetchTask[]) {
    for (const t of tasks) {
      this.pending.push(t);
      this.state.total++;
      if (t.group === "artworks") this.state.artworksTotal++;
    }
    this.sort();
    this.emit();
    this.pump();
  }

  /** Move tasks whose key starts with `prefix` to the front (e.g. a room). */
  prioritise(match: (t: PrefetchTask) => boolean) {
    for (const t of this.pending) if (match(t)) t.priority = -1;
    this.sort();
  }

  resume() {
    this.state.paused = false;
    this.emit();
    this.pump();
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.state);
    return () => void this.listeners.delete(fn);
  }

  private sort() {
    this.pending.sort((a, b) => a.priority - b.priority);
  }

  private emit() {
    this.state = { ...this.state, finished: this.pending.length === 0 && this.running === 0 && this.retrying === 0 && this.state.total > 0 };
    this.listeners.forEach((l) => l(this.state));
  }

  private next() {
    if (!this.state.paused) return this.pending.shift();
    const i = this.pending.findIndex((t) => !t.heavy);
    return i >= 0 ? this.pending.splice(i, 1)[0] : undefined;
  }

  private pump() {
    while (this.running < this.concurrency) {
      const task = this.next();
      if (!task) break;
      this.running++;
      void (async () => {
        await idle();
        try {
          await task.run();
          this.state.done++;
          if (task.group === "artworks") this.state.artworksDone++;
        } catch {
          const n = (this.attempts.get(task.key) ?? 0) + 1;
          this.attempts.set(task.key, n);
          if (n < 3) {
            // Retry later with back-off; it still counts as one item.
            this.retrying++;
            setTimeout(() => {
              this.retrying--;
              this.pending.push({ ...task, priority: task.priority + 10 });
              this.sort();
              this.pump();
            }, 1000 * 2 ** n);
          } else {
            this.state.failed++;
          }
        } finally {
          this.running--;
          this.emit();
          this.pump();
        }
      })();
    }
  }
}
