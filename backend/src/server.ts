// Local dev server only (`npm run dev`). Vercel serves src/index.ts directly.
import "dotenv/config";
import { serve } from "@hono/node-server";
import app from "./index";
import { isDetectionRunning, runDetectionPass } from "./lib/detect";

const port = Number(process.env.PORT ?? 3000);
console.log(`Listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });

// Obstacle-detection event loop: regularly sync Dortmund construction areas
// and rematch them against all routes. Skipped when DISABLE_DETECTION=1
// (e.g. on Vercel — use an external cron hitting POST /api/detect/run).
if (process.env.DISABLE_DETECTION !== "1") {
  const intervalMs = Number(process.env.DETECTION_INTERVAL_MS ?? 15 * 60 * 1000);
  const tick = async () => {
    if (isDetectionRunning()) return;
    try {
      const summary = await runDetectionPass();
      console.log(
        `[detect] pass done: routes=${summary.routesChecked} ` +
          `sites=${summary.sites?.fetched ?? "?"} ` +
          `obstacles=+${summary.obstaclesWritten}/-${summary.obstaclesPruned} ` +
          `errors=${summary.errors.length}`,
      );
    } catch (err) {
      console.error(
        "[detect] pass failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  };
  // First pass shortly after boot, then on the interval. unref() so the
  // timer never keeps the process alive on its own.
  setTimeout(tick, 10_000).unref?.();
  setInterval(tick, intervalMs).unref?.();
  console.log(`[detect] event loop enabled, interval=${intervalMs}ms`);
} else {
  console.log("[detect] event loop disabled (DISABLE_DETECTION=1)");
}
