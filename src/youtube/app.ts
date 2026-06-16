// Setup & start bot abangantech (dipakai oleh entrypoint sendiri & gabungan `all`).
// Flow: URL YouTube -> short; URL lain -> scrape+gambar; teks tanpa URL -> tweet teks.
import { config, type Lang } from "../config";
import { createUrlBot, type UrlBot } from "../telegram";
import { handleYoutubeUrl } from "./intake";
import { clearStaleProcessing } from "./db";
import { handleArticle } from "../article/intake";
import { clearStaleProcessing as clearStaleArticles } from "../article/db";
import { handleLink } from "../link/intake";
import { clearStaleProcessing as clearStaleLinks } from "../link/db";

const YT_URL_RE = /(https?:\/\/[^\s]*(?:youtube\.com|youtu\.be)[^\s]*)/i;
const URL_RE = /(https?:\/\/[^\s]+)/i;

/**
 * Router bot abangantech:
 * - URL YouTube  -> flow short (transcript -> gambar -> tweet)
 * - URL lain     -> flow scrape (scrape -> narasi -> gambar -> tweet)
 * - tanpa URL    -> flow teks (tweet dari teks, tanpa gambar)
 */
async function route(_url: string, fullText: string, lang: Lang): Promise<string> {
  const yt = fullText.match(YT_URL_RE);
  if (yt) return handleYoutubeUrl(yt[1]!, lang);

  const url = fullText.match(URL_RE);
  if (url) return handleLink(url[1]!, lang);

  return handleArticle(fullText, null, lang);
}

export async function startYoutubeBot(): Promise<UrlBot> {
  if (!config.youtube.telegramBotToken || !config.youtube.telegramChatId) {
    throw new Error("YT_TELEGRAM_BOT_TOKEN / YT_TELEGRAM_CHAT_ID belum diisi di .env");
  }
  if (!config.youtube.kieToken) throw new Error("KIE_API_TOKEN belum diisi di .env");

  const cleared =
    (await clearStaleProcessing()) + (await clearStaleArticles()) + (await clearStaleLinks());
  if (cleared) console.log(`[abangantech] bersihkan ${cleared} row 'processing' nyangkut (sisa crash).`);

  const bot = createUrlBot({
    token: config.youtube.telegramBotToken,
    allowedChatId: config.youtube.telegramChatId,
    onUrl: route,
    requireUrl: false, // izinkan teks tanpa URL (flow tweet teks)
    chooseLanguage: true, // tanya EN/ID dulu sebelum proses
  });
  bot.start();
  console.log("[abangantech] bot jalan -> YouTube short / scrape link / teks, pilih bahasa EN/ID.");
  return bot;
}
