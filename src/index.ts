// Entrypoint Threads (sendiri). Untuk jalankan dua automation sekaligus: src/all.ts
import { migrate } from "./db/migrate";
import { sql } from "./db/client";
import { startThreadsBot } from "./threads-app";

await migrate();
const bot = startThreadsBot();

async function shutdown() {
  console.log("\nMematikan...");
  await bot.stop();
  await sql.end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
