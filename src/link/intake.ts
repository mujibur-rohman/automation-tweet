// Pipeline link: URL apa pun -> scrape -> narasi -> prompt image -> gambar 16:9
// -> tweet -> foto+tweet ke Telegram + antrian Buffer (image lampiran).
import { config, type Lang } from "../config";
import { scrapeArticle } from "./scrape";
import { insertProcessing, patch, markQueued, remove } from "./db";
import { summarizeParagraph, buildImagePrompt, writeTweet } from "../youtube/ai";
import { generateImage } from "../youtube/image";
import { sendPhoto } from "../youtube/telegram";
import { createPost } from "../buffer/client";

export async function handleLink(url: string, lang: Lang = "id"): Promise<string> {
  const row = await insertProcessing(url);
  if (!row) return "⚠️ Ditolak — link ini sudah pernah diproses.";

  // 1) scrape -> narasi -> prompt image -> generate image -> tweet.
  let imageUrl: string;
  let tweet: string;
  try {
    const content = await scrapeArticle(url);
    await patch(row.id, { content });

    const paragraph = await summarizeParagraph(content, lang);
    await patch(row.id, { paragraph });

    const imagePrompt = await buildImagePrompt(paragraph, lang);
    await patch(row.id, { image_prompt: imagePrompt });

    imageUrl = await generateImage(imagePrompt, { aspectRatio: config.youtube.imageAspectRatio });
    await patch(row.id, { image_url: imageUrl });

    tweet = (await writeTweet(paragraph, lang)).trim();
    await patch(row.id, { tweet });
  } catch (err) {
    await remove(row.id); // hapus agar bisa diproses ulang
    return `❌ Gagal proses: ${(err as Error).message}`;
  }

  // 2) Kirim foto + tweet ke Telegram.
  try {
    await sendPhoto(imageUrl, tweet);
  } catch (err) {
    await remove(row.id);
    return `❌ Gagal kirim ke Telegram: ${(err as Error).message}`;
  }

  // 3) Buffer (best-effort) — tweet + image sebagai lampiran.
  try {
    const r = await createPost({
      channelId: config.youtube.bufferChannelId,
      text: tweet,
      media: [{ type: "image", url: imageUrl }],
    });
    await markQueued(row.id, r.postId, r.dueAt ? new Date(r.dueAt) : null);
    return "✅ Terkirim ke Telegram + masuk antrian Buffer (abangantech) dengan gambar.";
  } catch (err) {
    await patch(row.id, { status: "failed", error: (err as Error).message });
    return `✅ Terkirim ke Telegram.\n⚠️ Buffer gagal: ${(err as Error).message}`;
  }
}
