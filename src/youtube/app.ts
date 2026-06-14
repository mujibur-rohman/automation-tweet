// Setup & start bot abangantech (dipakai oleh entrypoint sendiri & gabungan `all`).
// Satu bot, dua flow: URL YouTube -> short; teks artikel + URL -> tweet artikel.
import { config } from "../config";
import { createUrlBot, type UrlBot } from "../telegram";
import { handleYoutubeUrl } from "./intake";
import { clearStaleProcessing } from "./db";
import { handleArticle } from "../article/intake";
import { clearStaleProcessing as clearStaleArticles } from "../article/db";

const YT_URL_RE = /(https?:\/\/[^\s]*(?:youtube\.com|youtu\.be)[^\s]*)/i;
// Link sumber HANYA dikenali bila URL ada di AKHIR pesan (URL di tengah teks diabaikan).
const TRAILING_URL_RE = /(https?:\/\/[^\s]+)\s*$/;

/**
 * Router bot abangantech:
 * - ada URL YouTube  -> flow short (transcript -> gambar -> Buffer + Telegram)
 * - URL di akhir teks -> flow konten dengan link sumber
 * - tanpa URL di akhir -> flow konten tanpa link (cuma generate tweet)
 */
async function route(_url: string, fullText: string): Promise<string> {
  const yt = fullText.match(YT_URL_RE);
  if (yt) return handleYoutubeUrl(yt[1]!);

  const trailing = fullText.trim().match(TRAILING_URL_RE);
  return handleArticle(fullText, trailing ? trailing[1]! : null);
}

export async function startYoutubeBot(): Promise<UrlBot> {
  if (!config.youtube.telegramBotToken || !config.youtube.telegramChatId) {
    throw new Error("YT_TELEGRAM_BOT_TOKEN / YT_TELEGRAM_CHAT_ID belum diisi di .env");
  }
  if (!config.youtube.kieToken) throw new Error("KIE_API_TOKEN belum diisi di .env");

  const cleared = (await clearStaleProcessing()) + (await clearStaleArticles());
  if (cleared) console.log(`[abangantech] bersihkan ${cleared} row 'processing' nyangkut (sisa crash).`);

  const bot = createUrlBot({
    token: config.youtube.telegramBotToken,
    allowedChatId: config.youtube.telegramChatId,
    onUrl: route,
    requireUrl: false, // izinkan teks tanpa URL (flow konten tanpa link)
  });
  bot.start();
  console.log("[abangantech] bot jalan -> URL YouTube (short) / teks artikel + URL (tweet ke Buffer).");
  return bot;
}
