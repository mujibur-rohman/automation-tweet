// Entrypoint YouTube (sendiri). Untuk jalankan dua automation sekaligus: src/all.ts
import { migrate } from "../db/migrate";
import { sql } from "../db/client";
import { startYoutubeBot } from "./app";

await migrate();
const bot = await startYoutubeBot();

async function shutdown() {
  console.log("\nMematikan (youtube)...");
  await bot.stop();
  await sql.end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
