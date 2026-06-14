// Setup & start bot YouTube (dipakai oleh entrypoint sendiri & gabungan `all`).
import { config } from "../config";
import { createUrlBot, type UrlBot } from "../telegram";
import { handleYoutubeUrl } from "./intake";
import { clearStaleProcessing } from "./db";

export async function startYoutubeBot(): Promise<UrlBot> {
  if (!config.youtube.telegramBotToken || !config.youtube.telegramChatId) {
    throw new Error("YT_TELEGRAM_BOT_TOKEN / YT_TELEGRAM_CHAT_ID belum diisi di .env");
  }
  if (!config.youtube.kieToken) throw new Error("KIE_API_TOKEN belum diisi di .env");

  const cleared = await clearStaleProcessing();
  if (cleared) console.log(`[youtube] bersihkan ${cleared} row 'processing' nyangkut (sisa crash).`);

  const bot = createUrlBot({
    token: config.youtube.telegramBotToken,
    allowedChatId: config.youtube.telegramChatId,
    onUrl: handleYoutubeUrl,
  });
  bot.start();
  console.log("[youtube] bot jalan -> kirim URL YouTube -> tweet + prompt ke Telegram.");
  return bot;
}
