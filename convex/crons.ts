import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Visitors whose tab closed without saying goodbye stop showing within ~1 minute.
crons.interval("sweep stale presence", { seconds: 30 }, internal.presence.sweep, {});
// Rebuild the head counters from presence now and then, so they can never drift.
crons.interval("recount visitors", { minutes: 10 }, internal.presence.recount, {});

export default crons;
