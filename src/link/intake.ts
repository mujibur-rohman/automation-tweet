// Pipeline link: URL apa pun -> scrape (teks + og:image) -> tweet (teks)
// -> kirim foto/teks ke Telegram + antrian Buffer (gambar artikel sebagai lampiran).
// Tanpa generate image. Gambar diambil dari artikel (og:image) kalau ada.
import { config, type Lang } from "../config";
import { scrapeArticle } from "./scrape";
import { insertProcessing, patch, markQueued, remove } from "./db";
import { writeTweet } from "../youtube/ai";
import { sendPhoto, sendText } from "../youtube/telegram";
import { createPost } from "../buffer/client";

export async function handleLink(url: string, lang: Lang = "id"): Promise<string> {
  const row = await insertProcessing(url);
  if (!row) return "⚠️ Ditolak — link ini sudah pernah diproses.";

  // 1) Scrape (teks + gambar artikel) + tweet.
  let tweet: string;
  let imageUrl: string | null = null;
  try {
    const { text, imageUrl: img } = await scrapeArticle(url);
    imageUrl = img;
    await patch(row.id, { content: text, image_url: img });

    tweet = (await writeTweet(text, lang)).trim();
    await patch(row.id, { tweet });
  } catch (err) {
    await remove(row.id);
    return `❌ Gagal proses: ${(err as Error).message}`;
  }

  // 2) Kirim ke Telegram: foto artikel + tweet kalau ada gambar, teks kalau tidak.
  try {
    if (imageUrl) await sendPhoto(imageUrl, tweet);
    else await sendText(tweet);
  } catch (err) {
    await remove(row.id);
    return `❌ Gagal kirim ke Telegram: ${(err as Error).message}`;
  }

  // 3) Buffer (best-effort) — lampirkan gambar artikel kalau ada.
  const imgNote = imageUrl ? "" : " (tanpa gambar — artikel tak punya og:image)";
  try {
    const r = await createPost({
      channelId: config.youtube.bufferChannelId,
      text: tweet,
      media: imageUrl ? [{ type: "image", url: imageUrl }] : undefined,
    });
    await markQueued(row.id, r.postId, r.dueAt ? new Date(r.dueAt) : null);
    return `✅ Terkirim ke Telegram + antrian Buffer (abangantech)${imgNote}.`;
  } catch (err) {
    await patch(row.id, { status: "failed", error: (err as Error).message });
    return `✅ Terkirim ke Telegram${imgNote}.\n⚠️ Buffer gagal: ${(err as Error).message}`;
  }
}
