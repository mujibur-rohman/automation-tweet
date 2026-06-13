// Entrypoint: migrasi -> start bot Telegram (terima URL) + scheduler sync.
import { config } from "./config";
import { migrate } from "./db/migrate";
import { sql } from "./db/client";
import { createUrlBot } from "./telegram";
import { handleUrl } from "./intake";
import { startScheduler } from "./scheduler";

if (!config.telegram.botToken || !config.telegram.chatId) {
  throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID belum diisi di .env");
}
if (config.buffer.profileIds.length === 0) {
  throw new Error("BUFFER_PROFILE_IDS belum diisi di .env");
}

await migrate();

const bot = createUrlBot({
  token: config.telegram.botToken,
  allowedChatId: config.telegram.chatId,
  onUrl: handleUrl,
});

const jobs = startScheduler();

async function shutdown() {
  console.log("\nMematikan...");
  jobs.forEach((j) => j.stop());
  await bot.stop();
  await sql.end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("Automation jalan.");
console.log("  Channel Buffer :", config.buffer.profileIds.join(", "));
console.log("  Cron sync      :", config.cron.sync);
console.log("  Telegram       : kirim URL post Threads -> bot proses & masukkan ke antrian Buffer.");

bot.start();
