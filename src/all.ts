// Jalankan KEDUA automation (Threads + YouTube) dalam satu proses.
import { migrate } from "./db/migrate";
import { sql } from "./db/client";
import { startThreadsBot } from "./threads-app";
import { startYoutubeBot } from "./youtube/app";

await migrate();

const threads = startThreadsBot();
const youtube = await startYoutubeBot();

console.log("Kedua automation jalan dalam satu proses.");

async function shutdown() {
  console.log("\nMematikan keduanya...");
  await Promise.allSettled([threads.stop(), youtube.stop()]);
  await sql.end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
