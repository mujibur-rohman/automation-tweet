// Setup & start bot abangantech (dipakai oleh entrypoint sendiri & gabungan `all`).
// Satu bot, dua flow: URL YouTube -> short; teks artikel + URL -> tweet artikel.
import { config } from "../config";
import { createUrlBot, type UrlBot } from "../telegram";
import { handleYoutubeUrl } from "./intake";
import { clearStaleProcessing } from "./db";
import { handleArticle } from "../article/intake";
import { clearStaleProcessing as clearStaleArticles } from "../article/db";

const YT_RE = /(?:youtube\.com|youtu\.be)/i;
const URL_G = /(https?:\/\/[^\s]+)/gi;

/** Router: ada URL YouTube -> flow short; selain itu -> flow artikel (URL terakhir = link). */
async function route(_url: string, fullText: string): Promise<string> {
  const urls = fullText.match(URL_G) ?? [];
  const ytUrl = urls.find((u) => YT_RE.test(u));
  if (ytUrl) return handleYoutubeUrl(ytUrl);

  const articleUrl = urls[urls.length - 1];
  if (!articleUrl) return "Kirim URL YouTube, atau teks artikel + URL di akhir.";
  return handleArticle(fullText, articleUrl);
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
  });
  bot.start();
  console.log("[abangantech] bot jalan -> URL YouTube (short) / teks artikel + URL (tweet ke Buffer).");
  return bot;
}
