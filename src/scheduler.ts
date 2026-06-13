// Cron internal: hanya SYNC (publish terjadi langsung saat URL masuk).
import { Cron } from "croner";
import { config } from "./config";
import { runSync } from "./jobs/sync";

export function startScheduler(): Cron[] {
  return [
    new Cron(config.cron.sync, { name: "sync", protect: true }, async () => {
      try {
        await runSync();
      } catch (err) {
        console.error("[cron:sync] error:", err);
      }
    }),
  ];
}
