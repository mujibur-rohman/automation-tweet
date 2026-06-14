// Setup & start bot Threads (dipakai oleh entrypoint sendiri & gabungan `all`).
import { config } from "./config";
import { createUrlBot, type UrlBot } from "./telegram";
import { handleUrl } from "./intake";

export function startThreadsBot(): UrlBot {
  if (!config.telegram.botToken || !config.telegram.chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID belum diisi di .env");
  }
  if (config.buffer.profileIds.length === 0) {
    throw new Error("BUFFER_PROFILE_IDS belum diisi di .env");
  }
  const bot = createUrlBot({
    token: config.telegram.botToken,
    allowedChatId: config.telegram.chatId,
    onUrl: handleUrl,
  });
  bot.start();
  console.log("[threads] bot jalan -> kirim URL post Threads -> antrian Buffer.");
  return bot;
}
