// Pipeline artikel: teks artikel + URL -> tweet respons+insight -> Buffer abangantech (+ link).
import { config } from "../config";
import { insertProcessing, patch, markQueued, remove } from "./db";
import { writeArticleTweet } from "../youtube/ai";
import { sendText } from "../youtube/telegram";
import { createPost } from "../buffer/client";

const MIN_ARTICLE_CHARS = 50;

export async function handleArticle(fullText: string, articleUrl: string): Promise<string> {
  if (!config.youtube.bufferChannelId) {
    return "❌ YT_BUFFER_CHANNEL_ID belum diisi di .env.";
  }
  // Teks artikel tanpa URL-nya (biar AI tidak echo link).
  const articleText = fullText.replace(articleUrl, "").trim();
  if (articleText.length < MIN_ARTICLE_CHARS) {
    return "❌ Kirim teks artikelnya juga (bukan cuma link).";
  }

  const row = await insertProcessing(articleUrl, articleText);
  if (!row) return "⚠️ Ditolak — artikel ini (URL) sudah pernah diproses.";

  // 1) Buat tweet.
  let text: string;
  try {
    const tweet = (await writeArticleTweet(articleText)).trim();
    await patch(row.id, { tweet });
    text = `${tweet}\n\n${articleUrl}`;
  } catch (err) {
    await remove(row.id);
    return `❌ Gagal buat tweet: ${(err as Error).message}`;
  }

  // 2) Kirim tweet ke Telegram (deliverable utama).
  try {
    await sendText(text);
  } catch (err) {
    await remove(row.id);
    return `❌ Gagal kirim ke Telegram: ${(err as Error).message}`;
  }

  // 3) Buffer (best-effort) — kalau gagal (limit), Telegram tetap terkirim.
  try {
    const r = await createPost({ channelId: config.youtube.bufferChannelId, text });
    await markQueued(row.id, r.postId, r.dueAt ? new Date(r.dueAt) : null);
    return "✅ Tweet artikel terkirim ke Telegram + masuk antrian Buffer (abangantech).";
  } catch (err) {
    await patch(row.id, { status: "failed", error: (err as Error).message });
    return `✅ Tweet artikel terkirim ke Telegram.\n⚠️ Buffer gagal: ${(err as Error).message}`;
  }
}
