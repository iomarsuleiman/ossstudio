import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Visitors whose tab closed without saying goodbye stop showing within ~1 minute.
crons.interval("sweep stale presence", { seconds: 30 }, internal.presence.sweep, {});
// Rebuild the head counters from presence now and then, so they can never drift.
crons.interval("recount visitors", { minutes: 10 }, internal.presence.recount, {});

// Backstop for the waiting line (the ticker admits people every tick while anyone waits).
crons.interval("admit from the waiting line", { seconds: 20 }, internal.queue.admit, {});

export default crons;
