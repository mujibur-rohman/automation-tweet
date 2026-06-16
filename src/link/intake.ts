// Pipeline link: URL apa pun -> scrape -> narasi -> tweet (+ gambar 16:9 best-effort)
// -> kirim ke Telegram (foto kalau ada gambar, teks kalau tidak) + antrian Buffer.
import { config, type Lang } from "../config";
import { scrapeArticle } from "./scrape";
import { insertProcessing, patch, markQueued, remove } from "./db";
import { summarizeParagraph, buildImagePrompt, writeTweet } from "../youtube/ai";
import { generateImage } from "../youtube/image";
import { sendPhoto, sendText } from "../youtube/telegram";
import { createPost } from "../buffer/client";

export async function handleLink(url: string, lang: Lang = "id"): Promise<string> {
  const row = await insertProcessing(url);
  if (!row) return "⚠️ Ditolak — link ini sudah pernah diproses.";

  // 1) Scrape + narasi + tweet (fatal kalau gagal). Gambar best-effort.
  let tweet: string;
  let imageUrl: string | null = null;
  try {
    const content = await scrapeArticle(url);
    await patch(row.id, { content });

    const paragraph = await summarizeParagraph(content, lang);
    await patch(row.id, { paragraph });

    tweet = (await writeTweet(paragraph, lang)).trim();
    await patch(row.id, { tweet });

    // Gambar best-effort: kalau gagal (mis. kredit habis 402), lanjut tanpa gambar.
    try {
      const imagePrompt = await buildImagePrompt(paragraph, lang);
      await patch(row.id, { image_prompt: imagePrompt });
      imageUrl = await generateImage(imagePrompt, { aspectRatio: config.youtube.imageAspectRatio });
      await patch(row.id, { image_url: imageUrl });
    } catch (err) {
      console.warn(`[link] gambar gagal, lanjut tanpa gambar: ${(err as Error).message}`);
    }
  } catch (err) {
    await remove(row.id); // hapus agar bisa diproses ulang
    return `❌ Gagal proses: ${(err as Error).message}`;
  }

  // 2) Kirim ke Telegram.
  try {
    if (imageUrl) await sendPhoto(imageUrl, tweet);
    else await sendText(tweet);
  } catch (err) {
    await remove(row.id);
    return `❌ Gagal kirim ke Telegram: ${(err as Error).message}`;
  }

  // 3) Buffer (best-effort).
  const noImg = imageUrl ? "" : " (tanpa gambar — generate image gagal)";
  try {
    const r = await createPost({
      channelId: config.youtube.bufferChannelId,
      text: tweet,
      media: imageUrl ? [{ type: "image", url: imageUrl }] : undefined,
    });
    await markQueued(row.id, r.postId, r.dueAt ? new Date(r.dueAt) : null);
    return `✅ Terkirim ke Telegram + antrian Buffer (abangantech)${noImg}.`;
  } catch (err) {
    await patch(row.id, { status: "failed", error: (err as Error).message });
    return `✅ Terkirim ke Telegram${noImg}.\n⚠️ Buffer gagal: ${(err as Error).message}`;
  }
}
